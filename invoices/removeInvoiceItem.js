const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { calculateTotalAmount, updateStockForMedicines, validateInvoiceForOperation } = require('./invoiceUtils');
const { formatDate } = require('../utils');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;

module.exports.handler = async (event) => {
  try {
    const invoiceId = event.pathParameters.invoiceId;
    const body = JSON.parse(event.body);
    
    if (!body.itemType || !body.itemId) {
      throw new Error('itemType and itemId are required');
    }

    // Get existing invoice
    const existingInvoice = await dynamodb.get({
      TableName: TABLE_INVOICE,
      Key: { invoiceId }
    }).promise();

    if (!existingInvoice.Item) {
      throw new Error('Invoice not found');
    }

    // Validate invoice can be modified
    validateInvoiceForOperation(existingInvoice.Item);

    const now = formatDate(new Date().toISOString());
    let updatedInvoice = { ...existingInvoice.Item };

    // Remove item based on type
    switch (body.itemType) {
      case 'medicine':
        if (updatedInvoice.medicinesArray) {
          const medicineIndex = updatedInvoice.medicinesArray.findIndex(
            item => item.medicineId === body.itemId
          );
          
          if (medicineIndex !== -1) {
            const removedMedicine = updatedInvoice.medicinesArray[medicineIndex];
            // Return medicine to stock
            await updateStockForMedicines([removedMedicine], 'add');
            
            updatedInvoice.medicinesArray.splice(medicineIndex, 1);
          }
        }
        break;
        
      case 'procedure':
        if (updatedInvoice.procedureArray) {
          updatedInvoice.procedureArray = updatedInvoice.procedureArray.filter(
            item => item.procedureId !== body.itemId
          );
        }
        break;
        
      case 'miscellaneous':
        if (updatedInvoice.miscellaneous) {
          updatedInvoice.miscellaneous = updatedInvoice.miscellaneous.filter(
            item => item.id !== body.itemId
          );
        }
        break;
        
      default:
        throw new Error('Invalid itemType. Must be medicine, procedure, or miscellaneous');
    }

    // Recalculate totals
    updatedInvoice.totalAmount = calculateTotalAmount(updatedInvoice);
    updatedInvoice.balanceAmount = updatedInvoice.totalAmount - (updatedInvoice.paidAmount || 0);
    updatedInvoice.lastUpdatedDateTime = now;

    // Update invoice
    await dynamodb.put({
      TableName: TABLE_INVOICE,
      Item: updatedInvoice
    }).promise();

    return success(updatedInvoice);
  } catch (err) {
    return error(err);
  }
};

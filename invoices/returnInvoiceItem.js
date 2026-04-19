const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { updateStockForMedicines } = require('./invoiceUtils');
const { formatDate } = require('../utils');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;

module.exports.handler = async (event) => {
  try {
    const invoiceId = event.pathParameters.invoiceId;
    const body = JSON.parse(event.body);
    
    if (!body.medicineId || !body.count) {
      throw new Error('medicineId and count are required');
    }

    // Get existing invoice
    const existingInvoice = await dynamodb.get({
      TableName: TABLE_INVOICE,
      Key: { invoiceId }
    }).promise();

    if (!existingInvoice.Item) {
      throw new Error('Invoice not found');
    }

    const now = formatDate(new Date().toISOString());
    const updatedInvoice = { ...existingInvoice.Item };

    // Find the medicine to return
    const medicineIndex = updatedInvoice.medicinesArray.findIndex(
      item => item.medicineId === body.medicineId
    );

    if (medicineIndex === -1) {
      throw new Error('Medicine not found in invoice');
    }

    const medicine = updatedInvoice.medicinesArray[medicineIndex];
    
    if (body.count > medicine.count) {
      throw new Error('Return count cannot exceed original purchase count');
    }

    // Return medicine to stock
    await updateStockForMedicines([{ ...medicine, count: body.count }], 'add');

    // Update medicine count or remove if all returned
    if (body.count === medicine.count) {
      updatedInvoice.medicinesArray.splice(medicineIndex, 1);
    } else {
      updatedInvoice.medicinesArray[medicineIndex].count -= body.count;
      updatedInvoice.medicinesArray[medicineIndex].amount = 
        (updatedInvoice.medicinesArray[medicineIndex].amount / medicine.count) * 
        updatedInvoice.medicinesArray[medicineIndex].count;
    }

    // Add to return medicines
    if (!updatedInvoice.returnMedicines) {
      updatedInvoice.returnMedicines = [];
    }

    updatedInvoice.returnMedicines.push({
      medicineId: body.medicineId,
      count: body.count,
      returnedAt: now,
      reason: body.reason || ''
    });

    // Recalculate totals
    let medicinesTotal = 0;
    if (updatedInvoice.medicinesArray.length > 0) {
      medicinesTotal = updatedInvoice.medicinesArray.reduce((sum, med) => sum + med.amount, 0);
    }

    const proceduresTotal = updatedInvoice.procedureArray.reduce((sum, proc) => sum + proc.amount, 0);
    const miscellaneousTotal = updatedInvoice.miscellaneous.reduce((sum, misc) => sum + misc.amount, 0);
    
    updatedInvoice.totalAmount = medicinesTotal + proceduresTotal + miscellaneousTotal + 
                               (updatedInvoice.doctorFee || 0) - (updatedInvoice.discount || 0);
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

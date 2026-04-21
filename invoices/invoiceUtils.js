const { dynamodb } = require('../utils/db');
const { getStockTableName } = require('../utils/db');
const { formatDate } = require('../utils');

// Calculate total amount for invoice (round down all amounts)
const calculateTotalAmount = (invoice) => {
  let total = 0;
  
  // Calculate medicines total
  if (invoice.medicines && invoice.medicines.length > 0) {
    total += invoice.medicines.reduce((sum, medicine) => sum + Math.floor(medicine.amount || 0), 0);
  }
 
  // Calculate procedures total
  if (invoice.procedures && invoice.procedures.length > 0) {
    total += invoice.procedures.reduce((sum, procedure) => sum + Math.floor(procedure.amount || 0), 0);
  }
   
  // Calculate miscellaneous total
  if (invoice.miscellaneous && invoice.miscellaneous.length > 0) {
    total += invoice.miscellaneous.reduce((sum, item) => sum + Math.floor(item.amount || 0), 0);
  }
   
  // Add doctor fee (round down)
  total += Math.floor(invoice.doctorFee || 0);
   
  // Apply discount (round down)
  total -= Math.floor(invoice.discount || 0);
   
  return Math.floor(Math.max(0, total));
};

// Update stock when medicines are added to invoice
const updateStockForMedicines = async (medicinesArray, operation = 'subtract') => {
  try {
    for (const medicine of medicinesArray) {
      const stockTableName = getStockTableName(medicine.medicineType);

      if (medicine.stockId) {
        // Update the specific stock item by stockId
        const stockGet = await dynamodb.get({
          TableName: stockTableName,
          Key: { stockId: medicine.stockId }
        }).promise();

        const stockItem = stockGet.Item;
        if (!stockItem) {
          throw new Error(`Stock not found for stockId: ${medicine.stockId}`);
        }

        const currentBalance = stockItem.balanceQuantity || 0;
        if (operation === 'subtract' && currentBalance < (medicine.count || 0)) {
          throw new Error(`Insufficient stock in stockId: ${medicine.stockId}`);
        }

        const newBalance = operation === 'subtract'
          ? currentBalance - (medicine.count || 0)
          : currentBalance + (medicine.count || 0);

        await dynamodb.update({
          TableName: stockTableName,
          Key: { stockId: medicine.stockId },
          UpdateExpression: 'SET balanceQuantity = :balance',
          ExpressionAttributeValues: { ':balance': Math.max(0, newBalance) }
        }).promise();
      } else {
        // Existing behavior: find available stock by medicineId ordered by expiry (FIFO)
        const stockQuery = {
          TableName: stockTableName,
          IndexName: 'medicineId-index',
          KeyConditionExpression: 'medicineId = :medicineId',
          FilterExpression: 'balanceQuantity > :zero',
          ExpressionAttributeValues: {
            ':medicineId': medicine.medicineId,
            ':zero': 0
          },
          ScanIndexForward: true // Ascending order (oldest expiry first)
        };

        const stockResult = await dynamodb.query(stockQuery).promise();
        const availableStocks = stockResult.Items || [];

        if (availableStocks.length === 0) {
          throw new Error(`No stock available for medicineId: ${medicine.medicineId}`);
        }

        let remainingQuantity = medicine.count;
        const stocksToUpdate = [];

        for (const stock of availableStocks) {
          if (remainingQuantity <= 0) break;

          const availableQty = Math.min(stock.balanceQuantity, remainingQuantity);
          stocksToUpdate.push({
            stockId: stock.stockId,
            quantity: availableQty,
            currentBalance: stock.balanceQuantity
          });

          remainingQuantity -= availableQty;
        }

        if (remainingQuantity > 0) {
          throw new Error(`Insufficient stock for medicineId: ${medicine.medicineId}`);
        }

        for (const stockUpdate of stocksToUpdate) {
          const newBalance = operation === 'subtract'
            ? stockUpdate.currentBalance - stockUpdate.quantity
            : stockUpdate.currentBalance + stockUpdate.quantity;

          await dynamodb.update({
            TableName: stockTableName,
            Key: { stockId: stockUpdate.stockId },
            UpdateExpression: 'SET balanceQuantity = :balance',
            ExpressionAttributeValues: { ':balance': Math.max(0, newBalance) }
          }).promise();
        }
      }

      // Update medicine-level balance quantity
      const medicineItem = await dynamodb.get({
        TableName: process.env.MEDICINE_TABLE,
        Key: { medicineId: medicine.medicineId }
      }).promise();

      if (medicineItem.Item) {
        const newMedicineBalance = operation === 'subtract'
          ? (medicineItem.Item.balanceQuantity || 0) - (medicine.count || 0)
          : (medicineItem.Item.balanceQuantity || 0) + (medicine.count || 0);

        await dynamodb.update({
          TableName: process.env.MEDICINE_TABLE,
          Key: { medicineId: medicine.medicineId },
          UpdateExpression: 'SET balanceQuantity = :balance, lastUpdatedDateTime = :now',
          ExpressionAttributeValues: {
            ':balance': Math.max(0, newMedicineBalance),
            ':now': formatDate(new Date().toISOString())
          }
        }).promise();
      }
    }

    return true;
  } catch (error) {
    console.error('Error updating stock:', error);
    throw error;
  }
};

// Validate invoice payment status for operations
const validateInvoiceForOperation = (invoice, allowedStatuses = [0, 1]) => {
  if (!allowedStatuses.includes(invoice.paymentStatus)) {
    throw new Error(`Invoice operation not allowed for payment status: ${invoice.paymentStatus}`);
  }
  return true;
};

module.exports = {
  calculateTotalAmount,
  updateStockForMedicines,
  validateInvoiceForOperation
};

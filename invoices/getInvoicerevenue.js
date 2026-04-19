const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;

module.exports.handler = async (event) => {
  try {
    const { period, startDate, endDate } = event.queryStringParameters || {};
    
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    // Query invoices within date range
    const queryParams = {
      TableName: TABLE_INVOICE,
      IndexName: 'createdDateTime-index',
      KeyConditionExpression: 'createdDateTime BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':startDate': startDate,
        ':endDate': endDate
      }
    };

    const result = await dynamodb.query(queryParams).promise();
    const invoices = result.Items;

    // Calculate revenue metrics
    const revenue = {
      totalRevenue: 0,
      medicineRevenue: 0,
      procedureRevenue: 0,
      miscellaneousRevenue: 0,
      doctorFeeTotal: 0,
      balanceTotal: 0,
      paidTotal: 0,
      discountTotal: 0,
      byPaymentMethod: {
        cash: 0,
        card: 0,
        online: 0
      }
    };

    invoices.forEach(invoice => {
      // Medicine revenue
      if (invoice.medicinesArray) {
        revenue.medicineRevenue += invoice.medicinesArray.reduce((sum, med) => sum + med.amount, 0);
      }

      // Procedure revenue
      if (invoice.procedureArray) {
        revenue.procedureRevenue += invoice.procedureArray.reduce((sum, proc) => sum + proc.amount, 0);
      }

      // Miscellaneous revenue
      if (invoice.miscellaneous) {
        revenue.miscellaneousRevenue += invoice.miscellaneous.reduce((sum, misc) => sum + misc.amount, 0);
      }

      // Doctor fee
      revenue.doctorFeeTotal += invoice.doctorFee || 0;

      // Totals
      revenue.totalRevenue += invoice.totalAmount || 0;
      revenue.balanceTotal += invoice.balanceAmount || 0;
      revenue.paidTotal += invoice.paidAmount || 0;
      revenue.discountTotal += invoice.discount || 0;

      // Payment methods
      revenue.byPaymentMethod.cash += invoice.cashPaymentAmount || 0;
      revenue.byPaymentMethod.card += invoice.cardPaymentAmount || 0;
      revenue.byPaymentMethod.online += invoice.onlinePaymentAmount || 0;
    });

    return success(revenue);
  } catch (err) {
    return error(err);
  }
};
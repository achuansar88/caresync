const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateInvoiceForOperation } = require('./invoiceUtils');
const { formatDate } = require('../utils');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;

module.exports.handler = async (event) => {
  try {
    const invoiceId = event.pathParameters.invoiceId;
    const body = JSON.parse(event.body);
    
    // Get existing invoice
    const existingInvoice = await dynamodb.get({
      TableName: TABLE_INVOICE,
      Key: { invoiceId }
    }).promise();

    if (!existingInvoice.Item) {
      throw new Error('Invoice not found');
    }

    const now = formatDate(new Date().toISOString());
    const updateExpression = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    // Validate payment update
    validateInvoiceForOperation(existingInvoice.Item);

    // Calculate new payment values
    const paidAmount = (existingInvoice.Item.paidAmount || 0) + (body.paidAmount || 0);
    const balanceAmount = existingInvoice.Item.totalAmount - paidAmount - (body.discount || 0);
    
    let paymentStatus = existingInvoice.Item.paymentStatus;
    if (balanceAmount <= 0) {
      paymentStatus = 2; // completed
    } else if (paidAmount > 0) {
      paymentStatus = 1; // partially paid
    }

    // Build update expression
    updateExpression.push('#paidAmount = :paidAmount');
    updateExpression.push('#balanceAmount = :balanceAmount');
    updateExpression.push('#paymentStatus = :paymentStatus');
    updateExpression.push('#lastUpdatedDateTime = :lastUpdatedDateTime');
    
    expressionAttributeNames['#paidAmount'] = 'paidAmount';
    expressionAttributeNames['#balanceAmount'] = 'balanceAmount';
    expressionAttributeNames['#paymentStatus'] = 'paymentStatus';
    expressionAttributeNames['#lastUpdatedDateTime'] = 'lastUpdatedDateTime';
    
    expressionAttributeValues[':paidAmount'] = paidAmount;
    expressionAttributeValues[':balanceAmount'] = balanceAmount;
    expressionAttributeValues[':paymentStatus'] = paymentStatus;
    expressionAttributeValues[':lastUpdatedDateTime'] = now;

    // Add payment method amounts
    if (body.onlinePaymentAmount !== undefined) {
      updateExpression.push('#onlinePaymentAmount = #onlinePaymentAmount + :onlinePaymentAmount');
      expressionAttributeNames['#onlinePaymentAmount'] = 'onlinePaymentAmount';
      expressionAttributeValues[':onlinePaymentAmount'] = body.onlinePaymentAmount;
    }

    if (body.cashPaymentAmount !== undefined) {
      updateExpression.push('#cashPaymentAmount = #cashPaymentAmount + :cashPaymentAmount');
      expressionAttributeNames['#cashPaymentAmount'] = 'cashPaymentAmount';
      expressionAttributeValues[':cashPaymentAmount'] = body.cashPaymentAmount;
    }

    if (body.cardPaymentAmount !== undefined) {
      updateExpression.push('#cardPaymentAmount = #cardPaymentAmount + :cardPaymentAmount');
      expressionAttributeNames['#cardPaymentAmount'] = 'cardPaymentAmount';
      expressionAttributeValues[':cardPaymentAmount'] = body.cardPaymentAmount;
    }

    // Apply discount if provided and not already applied
    if (body.discount !== undefined && existingInvoice.Item.discount === 0) {
      updateExpression.push('#discount = :discount');
      expressionAttributeNames['#discount'] = 'discount';
      expressionAttributeValues[':discount'] = body.discount;
    }

    // Update invoice
    const result = await dynamodb.update({
      TableName: TABLE_INVOICE,
      Key: { invoiceId },
      UpdateExpression: 'SET ' + updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }).promise();

    return success(result.Attributes);
  } catch (err) {
    return error(err);
  }
};

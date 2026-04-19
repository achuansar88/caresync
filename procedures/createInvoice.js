// Lambda to create invoice for confirmed procedures
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { formatDate } = require('../utils');
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.INVOICE_TABLE || `${process.env.stage || 'dev'}InvoiceTable`;

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      patientId,
      medicines = [],
      procedures = [],
      doctorFee = 0,
      miscellaneous = [],
      total = 0,
      paymentStatus = 'pending',
      paymentType = '',
      paymentDateTime = '',
      balanceAmount = 0,
      paidAmount = 0,
      lastPaymentUpdateAmount = 0,
    } = body;
    if (!patientId || !procedures.length) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }
    const invoiceId = uuidv4();
    const item = {
      invoiceId,
      patientId,
      medicines,
      procedures,
      doctorFee,
      miscellaneous,
      total,
      paymentStatus,
      paymentType,
      paymentDateTime,
      paidAmount: 0,
      balanceAmount: 0,
      onlinePaymentAmount: 0,
      cashPaymentAmount: 0,
      cardPaymentAmount: 0,
      lastPaymentUpdateAmount,
      createdAt: formatDate(new Date().toISOString()),
    };
    await docClient.put({ TableName: TABLE, Item: item }).promise();
    return { statusCode: 201, body: JSON.stringify(item) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

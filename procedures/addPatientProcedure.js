// Lambda to add a patient procedure
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { formatDate } = require('../utils');
const docClient = new AWS.DynamoDB.DocumentClient();

const TABLE = process.env.PATIENT_PROCEDURE_TABLE || `${process.env.stage || 'dev'}PatientProcedureTable`;

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      patientId,
      procedureId,
      procedure,
      requirements = [],
      additionalInfo = '',
    } = body;
    if (!patientId || procedureId === undefined || !procedure) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }
    const patientProcedureId = uuidv4();
    const status = 0; // Not confirmed
    const item = {
      patientProcedureId,
      patientId: patientId.toString(),
      procedureId,
      procedure,
      requirements,
      status,
      additionalInfo,
      createdAt: formatDate(new Date().toISOString()),
    };
    await docClient.put({ TableName: TABLE, Item: item }).promise();
    return { statusCode: 201, body: JSON.stringify(item) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

// Lambda to delete a patient procedure (only if not confirmed)
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.PATIENT_PROCEDURE_TABLE || `${process.env.stage || 'dev'}PatientProcedureTable`;

exports.handler = async (event) => {
  try {
    const patientProcedureId = event.pathParameters.patientProcedureId;
    // Fetch current item
    const { Item } = await docClient.get({ TableName: TABLE, Key: { patientProcedureId } }).promise();
    if (!Item) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
    if (Item.status === 1) return { statusCode: 400, body: JSON.stringify({ message: 'Cannot delete confirmed procedure' }) };
    await docClient.delete({ TableName: TABLE, Key: { patientProcedureId } }).promise();
    return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

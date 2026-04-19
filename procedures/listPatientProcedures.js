// Lambda to list patient procedures by userId
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.PATIENT_PROCEDURE_TABLE || `${process.env.stage || 'dev'}PatientProcedureTable`;

exports.handler = async (event) => {
  try {
    const patientId = event.queryStringParameters && event.queryStringParameters.patientId;
    if (!patientId) return { statusCode: 400, body: JSON.stringify({ message: 'Missing patientId' }) };
    const result = await docClient.query({
      TableName: TABLE,
      IndexName: 'patientId-index',
      KeyConditionExpression: 'patientId = :u',
      ExpressionAttributeValues: { ':u': patientId },
    }).promise();
    return { statusCode: 200, body: JSON.stringify(result.Items) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

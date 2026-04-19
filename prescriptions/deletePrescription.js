const AWS = require('aws-sdk');
const { successResponse, errorResponse } = require('../utils/responses');
const { sendResponse } = require('../utils');
const { PRESCRIPTION_TABLE } = process.env;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  try {
    const { prescriptionId } = event.pathParameters || {};
    if (!prescriptionId) {
      return sendResponse(400, {error: 'Missing prescriptionId'});
    }
    await dynamoDb.delete({
      TableName: PRESCRIPTION_TABLE,
      Key: { prescriptionId }
    }).promise();
    return sendResponse(200,{ message: 'Prescription deleted', prescriptionId });
  } catch (err) {
    return sendResponse(500, {error: err.message});
  }
};

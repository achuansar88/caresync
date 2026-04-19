const AWS = require('aws-sdk');
const { successResponse, errorResponse } = require('../utils/responses');
const { formatDate } = require('../utils');
const { PRESCRIPTION_TABLE } = process.env;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { prescriptionId, ...fieldsToUpdate } = body;
    if (!prescriptionId) {
      return errorResponse(400, 'Missing prescriptionId');
    }
    const updateExp = [];
    const expAttrNames = {};
    const expAttrValues = {};
    for (const key in fieldsToUpdate) {
      updateExp.push(`#${key} = :${key}`);
      expAttrNames[`#${key}`] = key;
      expAttrValues[`:${key}`] = fieldsToUpdate[key];
    }
    updateExp.push('#updatedAt = :updatedAt');
    expAttrNames['#updatedAt'] = 'updatedAt';
    expAttrValues[':updatedAt'] = formatDate(new Date().toISOString());
    await dynamoDb.update({
      TableName: PRESCRIPTION_TABLE,
      Key: { prescriptionId },
      UpdateExpression: 'SET ' + updateExp.join(', '),
      ExpressionAttributeNames: expAttrNames,
      ExpressionAttributeValues: expAttrValues,
      ReturnValues: 'ALL_NEW'
    }).promise();
    return successResponse({ prescriptionId, ...fieldsToUpdate });
  } catch (err) {
    return errorResponse(500, err.message);
  }
};

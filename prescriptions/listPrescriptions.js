const AWS = require('aws-sdk');
const { success, error } = require('../utils/responses');
const { sendResponse } = require('../utils');
const { PRESCRIPTION_TABLE } = process.env;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};
    const filterExp = [];
    const expAttrNames = {};
    const expAttrValues = {};
    ['userId', 'medicineId', 'medicineType', 'prescribedDate'].forEach((key) => {
      if (query[key]) {
        filterExp.push(`#${key} = :${key}`);
        expAttrNames[`#${key}`] = key;
        expAttrValues[`:${key}`] = query[key];
      }
    });
    const params = {
      TableName: PRESCRIPTION_TABLE
    };
    if (filterExp.length) {
      params.FilterExpression = filterExp.join(' AND ');
      params.ExpressionAttributeNames = expAttrNames;
      params.ExpressionAttributeValues = expAttrValues;
    }
    const data = await dynamoDb.scan(params).promise();
    return sendResponse(200, {
      message: "Prescription list", data: data.Items,
    });
  } catch (err) {
     
    return sendResponse(500, {error: err.message});
  }
};

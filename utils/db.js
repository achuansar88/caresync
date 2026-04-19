const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const MEDICINE_TYPES = ['tablet', 'syrup', 'drops', 'respules', 'injection', 'ointment', 'surgicals', 'fluids', 'capsule', 'other'];

const getStockTableName = (medicineType) => {
  if (!MEDICINE_TYPES.includes(medicineType)) {
    throw new Error(`Invalid medicine type: ${medicineType}`);
  }
  return process.env[`STOCK_${medicineType.toUpperCase()}_TABLE`];
};
module.exports = {
  dynamodb,
  MEDICINE_TYPES,
  getStockTableName,
  putItem: async (tableName, item) => {
    const params = {
      TableName: tableName,
      Item: item
    };
    return dynamodb.put(params).promise();
  },
  getItem: async (tableName, key) => {
    const params = {
      TableName: tableName,
      Key: key
    };
    return dynamodb.get(params).promise();
  },
  updateItem: async (tableName, key, updateExpression, expressionAttributeValues, conditionExpression) => {
    const params = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };
    if (conditionExpression) {
      params.ConditionExpression = conditionExpression;
    }
    return dynamodb.update(params).promise();
  },
  queryItems: async (tableName, keyConditionExpression, expressionAttributeValues, indexName) => {
    const params = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };
    if (indexName) {
      params.IndexName = indexName;
    }
    return dynamodb.query(params).promise();
  },
  scanItems: async (tableName, filterExpression, expressionAttributeValues) => {
    const params = {
      TableName: tableName
    };
    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionAttributeValues;
    }
    return dynamodb.scan(params).promise();
  }
};
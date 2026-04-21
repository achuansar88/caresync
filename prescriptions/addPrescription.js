const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const { successResponse, errorResponse } = require('../utils/responses');
const { formatDate, sendResponse } = require('../utils');
const { PRESCRIPTION_TABLE } = process.env;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      userId,
      medicineId,
      medicineName,
      medicineType,
      frequency,
      daysPrescribed,
      additionalInfo, 
      dosage,
      prescribedBy,
      prescribedDate
    } = body;

    if (!userId || !medicineId || !medicineName || !medicineType || !frequency || !daysPrescribed || !dosage || !prescribedBy || !prescribedDate) {
      return sendResponse(400, 'Missing required fields');
    }
    const now = formatDate(new Date().toISOString());
    const prescriptionId = uuidv4();
    const item = {
      prescriptionId,
      userId: userId.toString(),
      medicineId,
      medicineName,
      medicineType,
      frequency,
      daysPrescribed,
      prescribedDate: now.split('T')[0],
      dosage,
      additionalInfo: additionalInfo || null,
      prescribedBy,
      createdAt: now,
      updatedAt: now
    };

    await dynamoDb.put({
      TableName: PRESCRIPTION_TABLE,
      Item: item
    }).promise();

    return sendResponse(201, { prescriptionId, ...item} );
  } catch (err) {
    return sendResponse(500, {error: err.message});
  }
};

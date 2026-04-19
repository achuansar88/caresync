const { dynamodb, updateItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateMedicine } = require('../utils/validations');
const { formatDate } = require('../utils');
const TABLE_MEDICINE = process.env.MEDICINE_TABLE;
module.exports.handler = async (event) => {
  try {
    const medicineId = event.pathParameters.medicineId;
    const body = JSON.parse(event.body);
    validateMedicine(body);
    const normalizedName = body.medicineName.trim().toUpperCase();
    const normalizedType = body.medicineType.toLowerCase();
    const minStockCount = Number(body.minStockCount || 0);
    
    // Check if medicine exists
    const existingMedicine = await dynamodb.get({
      TableName: TABLE_MEDICINE,
      Key: { medicineId }
    }).promise();
    
    if (!existingMedicine.Item) {
      throw new Error('Medicine not found');
    }

    const duplicateMedicine = await dynamodb.scan({
      TableName: TABLE_MEDICINE,
      FilterExpression: 'medicineName = :name AND medicineId <> :medicineId AND isDelete = :isDelete',
      ExpressionAttributeValues: {
        ':name': normalizedName,
        ':medicineId': medicineId,
        ':isDelete': false
      }
    }).promise();

    if (duplicateMedicine.Items && duplicateMedicine.Items.length > 0) {
      throw new Error('Medicine with same name already exists');
    }
    
    const updateExpression = 'SET medicineName = :name, medicineType = :type, minStockCount = :minStockCount, lastUpdatedDateTime = :updated';
    
    const expressionAttributeValues = {
      ':name': normalizedName,
      ':type': normalizedType,
      ':minStockCount': minStockCount,
      ':updated': formatDate(new Date().toISOString())
    };
    
    const updatedMedicine = await updateItem(
      TABLE_MEDICINE,
      { medicineId },
      updateExpression,
      expressionAttributeValues
    );
    
    return success(updatedMedicine.Attributes);
  } catch (err) {
    return error(err);
  }
};

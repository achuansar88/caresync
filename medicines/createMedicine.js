const { dynamodb, putItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateMedicine, generateId } = require('../utils/validations');
const { formatDate } = require('../utils');
const TABLE_MEDICINE = process.env.MEDICINE_TABLE;
module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    validateMedicine(body);
    const normalizedName = body.medicineName.trim().toUpperCase();
    const normalizedType = body.medicineType.toLowerCase();
    const minStockCount = Number(body.minStockCount || 0);
    
    // Check for duplicate medicine name
    const existingMedicine = await dynamodb.scan({
      TableName: TABLE_MEDICINE,
      FilterExpression: 'medicineName = :name AND isDelete = :isDelete',
      ExpressionAttributeValues: {
        ':name': normalizedName,
        ':isDelete': false
      }
    }).promise();
    
    if (existingMedicine.Items && existingMedicine.Items.length > 0) {
      throw new Error('Medicine with same name already exists');
    }
    
    const medicineId = generateId();
    const now = formatDate(new Date().toISOString());
    const medicine = {
      medicineId,
      medicineName: normalizedName,
      medicineType: normalizedType,
      minStockCount,
      balanceQuantity: 0,
      createdDateTime: now,
      lastUpdatedDateTime: now,
      isDelete: false
    };
    
    await putItem(TABLE_MEDICINE, medicine);
    
    return success(medicine, 201);
  } catch (err) {
    return error(err);
  }
};

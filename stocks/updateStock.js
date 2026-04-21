const { dynamodb, updateItem, getStockTableName } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateStock } = require('../utils/validations');
const { formatDate } = require('../utils');

module.exports.handler = async (event) => {
  try {
    const stockId = event.pathParameters.stockId;
    const body = JSON.parse(event.body);
    
    if (!stockId) {
      throw new Error('Stock ID is required');
    }
    
    if (!body.medicineType) {
      throw new Error('medicineType is required');
    }
    
    const medicineType = body.medicineType.toLowerCase();
    const actualMedicineType = medicineType;
    
    const stockTableName = getStockTableName(actualMedicineType);
    
    // Get existing stock to calculate quantity difference
    const existingStock = await dynamodb.get({
      TableName: stockTableName,
      Key: { stockId }
    }).promise();
    
    if (!existingStock.Item) {
      throw new Error('Stock not found');
    }
    
    // Build dynamic update expression only for provided fields
    const updates = [];
    const values = {};
    const expNames = {};
    
    if (body.tradeName !== undefined) {
      updates.push('#tn = :tradeName');
      values[':tradeName'] = body.tradeName;
      expNames['#tn'] = 'tradeName';
    }
    if (body.vendorName !== undefined) {
      updates.push('vendorName = :vendorName');
      values[':vendorName'] = body.vendorName;
    }
    if (body.vendorId !== undefined) {
      updates.push('vendorId = :vendorId');
      values[':vendorId'] = body.vendorId;
    }
    if (body.expiryDate !== undefined) {
      updates.push('expiryDate = :expiryDate');
      values[':expiryDate'] = formatDate(body.expiryDate);
    }
    if (body.purchaseDate !== undefined) {
      updates.push('purchaseDate = :purchaseDate');
      values[':purchaseDate'] = formatDate(body.purchaseDate).split('T')[0];
    }
    if (body.rate !== undefined) {
      updates.push('rate = :rate');
      values[':rate'] = body.rate;
    }
    if (body.totalQuantity !== undefined) {
      updates.push('totalQuantity = :totalQuantity');
      values[':totalQuantity'] = body.totalQuantity;
    }
    if (body.totalRate !== undefined) {
      updates.push('totalRate = :totalRate');
      values[':totalRate'] = body.totalRate;
    }
    if (body.gstPercent !== undefined) {
      updates.push('gstPercent = :gstPercent');
      values[':gstPercent'] = body.gstPercent;
    }
    if (body.balanceQuantity !== undefined) {
      updates.push('balanceQuantity = :balanceQuantity');
      values[':balanceQuantity'] = body.balanceQuantity;
    }
    if (body.mrpPerItem !== undefined) {
      updates.push('mrpPerItem = :mrpPerItem');
      values[':mrpPerItem'] = body.mrpPerItem;
    }
    if (body.ratePerItem !== undefined) {
      updates.push('ratePerItem = :ratePerItem');
      values[':ratePerItem'] = body.ratePerItem;
    }
    
    // Type-specific fields
    if (body.totalStrips !== undefined) {
      updates.push('totalStrips = :totalStrips');
      values[':totalStrips'] = body.totalStrips;
    }
    if (body.countPerStrip !== undefined) {
      updates.push('countPerStrip = :countPerStrip');
      values[':countPerStrip'] = body.countPerStrip;
    }
    if (body.mrpPerStrip !== undefined) {
      updates.push('mrpPerStrip = :mrpPerStrip');
      values[':mrpPerStrip'] = body.mrpPerStrip;
    }
    if (body.totalBox !== undefined) {
      updates.push('totalBox = :totalBox');
      values[':totalBox'] = body.totalBox;
    }
    if (body.bottlePerBox !== undefined) {
      updates.push('bottlePerBox = :bottlePerBox');
      values[':bottlePerBox'] = body.bottlePerBox;
    }
    if (body.mrpPerBottle !== undefined) {
      updates.push('mrpPerBottle = :mrpPerBottle');
      values[':mrpPerBottle'] = body.mrpPerBottle;
    }
    if (body.dropsPerBox !== undefined) {
      updates.push('dropsPerBox = :dropsPerBox');
      values[':dropsPerBox'] = body.dropsPerBox;
    }
    if (body.mrpPerDrops !== undefined) {
      updates.push('mrpPerDrops = :mrpPerDrops');
      values[':mrpPerDrops'] = body.mrpPerDrops;
    }
    if (body.respulesPerBox !== undefined) {
      updates.push('respulesPerBox = :respulesPerBox');
      values[':respulesPerBox'] = body.respulesPerBox;
    }
    if (body.mrpPerRespule !== undefined) {
      updates.push('mrpPerRespule = :mrpPerRespule');
      values[':mrpPerRespule'] = body.mrpPerRespule;
    }
    if (body.totalInjectionsSheet !== undefined) {
      updates.push('totalInjectionsSheet = :totalInjectionsSheet');
      values[':totalInjectionsSheet'] = body.totalInjectionsSheet;
    }
    if (body.injectionsPerSheet !== undefined) {
      updates.push('injectionsPerSheet = :injectionsPerSheet');
      values[':injectionsPerSheet'] = body.injectionsPerSheet;
    }
    if (body.mrpPerInjections !== undefined) {
      updates.push('mrpPerInjections = :mrpPerInjections');
      values[':mrpPerInjections'] = body.mrpPerInjections;
    }
    if (body.ointmentPerBox !== undefined) {
      updates.push('ointmentPerBox = :ointmentPerBox');
      values[':ointmentPerBox'] = body.ointmentPerBox;
    }
    if (body.mrpPerTube !== undefined) {
      updates.push('mrpPerTube = :mrpPerTube');
      values[':mrpPerTube'] = body.mrpPerTube;
    }
    
    // Always update lastUpdatedDate
    updates.push('lastUpdatedDate = :updated');
    values[':updated'] = formatDate(new Date().toISOString());
    
    if (updates.length === 1) {
      throw new Error('No fields to update');
    }
    
    // Update stock
    const updatedStock = await dynamodb.update({
      TableName: stockTableName,
      Key: { stockId },
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: Object.keys(expNames).length > 0 ? expNames : undefined,
      ReturnValues: 'ALL_NEW'
    }).promise();
    
// Update medicine balance quantity if total quantity changed and medicineId is provided
    if (body.totalQuantity !== undefined && body.medicineId && existingStock.Item.totalQuantity !== body.totalQuantity) {
      const quantityDiff = body.totalQuantity - existingStock.Item.totalQuantity;
      const medicine = await dynamodb.get({
        TableName: 'TABLE_MEDICINE',
        Key: { medicineId: body.medicineId }
      }).promise();
      
      if (medicine.Item) {
        const newBalance = (medicine.Item.balanceQuantity || 0) + quantityDiff;
        await dynamodb.update({
          TableName: 'TABLE_MEDICINE',
          Key: { medicineId: body.medicineId },
          UpdateExpression: 'SET balanceQuantity = :balance, lastUpdatedDateTime = :updated',
          ExpressionAttributeValues: {
            ':balance': newBalance,
            ':updated': formatDate(new Date().toISOString())
          }
        }).promise();
      }
    }
    
    return success(updatedStock.Attributes);
  } catch (err) {
    return error(err);
  }
};

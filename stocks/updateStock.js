const { dynamodb, updateItem, getStockTableName } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateStock } = require('../utils/validations');
const { formatDate } = require('../utils');

module.exports.handler = async (event) => {
  try {
    const stockId = event.pathParameters.stockId;
    const body = JSON.parse(event.body);
    const medicineType = body.medicineType.toLowerCase();
    validateStock(body, medicineType);
    
    // Get existing stock to calculate quantity difference
    const stockTableName = getStockTableName(medicineType);
    const existingStock = await dynamodb.get({
      TableName: stockTableName,
      Key: { stockId }
    }).promise();
    
    if (!existingStock.Item) {
      throw new Error('Stock not found');
    }
    
    // Prepare update expression
    const updateExpression = [
      'SET tradeName = :tradeName',
      'expiryDate = :expiryDate',
      'purchaseDate = :purchaseDate',
      'lastUpdatedDate = :updated',
      'rate = :rate',
      'totalQuantity = :totalQuantity',
      'totalRate = :totalRate',
      'balanceQuantity = :balanceQuantity'
    ];
    
    const expressionAttributeValues = {
      ':tradeName': body.tradeName,
      ':expiryDate': formatDate(body.expiryDate),
      ':purchaseDate': formatDate(body.purchaseDate).split('T')[0],
      ':updated': formatDate(new Date().toISOString()),
      ':rate': body.rate,
      ':totalQuantity': body.totalQuantity,
      ':totalRate': body.totalRate,
      ':balanceQuantity': body.balanceQuantity
    };
    
    // Add type-specific fields to update
    switch (medicineType) {
      case 'tablet':
        updateExpression.push('totalStrips = :totalStrips');
        updateExpression.push('countPerStrip = :countPerStrip');
        updateExpression.push('mrpPerStrip = :mrpPerStrip');
        expressionAttributeValues[':totalStrips'] = body.totalStrips;
        expressionAttributeValues[':countPerStrip'] = body.countPerStrip;
        expressionAttributeValues[':mrpPerStrip'] = body.mrpPerStrip;
        break;
      case 'syrup':
        updateExpression.push('totalBox = :totalBox');
        updateExpression.push('bottlePerBox = :bottlePerBox');
        updateExpression.push('mrpPerBottle = :mrpPerBottle');
        expressionAttributeValues[':totalBox'] = body.totalBox;
        expressionAttributeValues[':bottlePerBox'] = body.bottlePerBox;
        expressionAttributeValues[':mrpPerBottle'] = body.mrpPerBottle;
        break;
      case 'drops':
        updateExpression.push('totalBox = :totalBox');
        updateExpression.push('dropsPerBox = :dropsPerBox');
        updateExpression.push('mrpPerDrops = :mrpPerDrops');
        expressionAttributeValues[':totalBox'] = body.totalBox;
        expressionAttributeValues[':dropsPerBox'] = body.dropsPerBox;
        expressionAttributeValues[':mrpPerDrops'] = body.mrpPerDrops;
        break;
      case 'respules':
        updateExpression.push('totalBox = :totalBox');
        updateExpression.push('respulesPerBox = :respulesPerBox');
        updateExpression.push('mrpPerRespules = :mrpPerRespules');
        expressionAttributeValues[':totalBox'] = body.totalBox;
        expressionAttributeValues[':respulesPerBox'] = body.respulesPerBox;
        expressionAttributeValues[':mrpPerRespules'] = body.mrpPerRespules;
        break;
      case 'injection':
        updateExpression.push('totalInjectionsSheet = :totalInjectionsSheet');
        updateExpression.push('injectionsPerSheet = :injectionsPerSheet');
        updateExpression.push('mrpPerInjections = :mrpPerInjections');
        expressionAttributeValues[':totalInjectionsSheet'] = body.totalInjectionsSheet;
        expressionAttributeValues[':injectionsPerSheet'] = body.injectionsPerSheet;
        expressionAttributeValues[':mrpPerInjections'] = body.mrpPerInjections;
        break;
      case 'ointment':
        updateExpression.push('totalBox = :totalBox');
        updateExpression.push('ointmentPerBox = :ointmentPerBox');
        updateExpression.push('mrpPerOintment = :mrpPerOintment');
        expressionAttributeValues[':totalBox'] = body.totalBox;
        expressionAttributeValues[':ointmentPerBox'] = body.ointmentPerBox;
        expressionAttributeValues[':mrpPerOintment'] = body.mrpPerOintment;
        break;
    }
    
    // Update stock
    const updatedStock = await dynamodb.update({
      TableName: stockTableName,
      Key: { stockId },
      UpdateExpression: 'SET ' + updateExpression.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }).promise();
    
    // Update medicine balance quantity if total quantity changed
    if (existingStock.Item.totalQuantity !== body.totalQuantity) {
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

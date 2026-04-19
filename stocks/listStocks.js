const { dynamodb, getStockTableName } = require('../utils/db');
const { success, error } = require('../utils/responses');
const TABLE_MEDICINE = process.env.MEDICINE_TABLE;
const TABLE_VENDOR = process.env.VENDOR_TABLE;
module.exports.handler = async (event) => {
  try {
    const queryParams = event.queryStringParameters || {};
    let stocks = [];
    
    // Determine which stock table to query based on medicineType
    const medicineType = queryParams.medicineType ? queryParams.medicineType.toLowerCase() : null;
    const stockTableName = medicineType ? getStockTableName(medicineType) : null;
    
    if (queryParams.medicineId) {
      // List stocks by medicineId
      if (!stockTableName) {
        throw new Error('medicineType is required when searching by medicineId');
      }
      
      const result = await dynamodb.query({
        TableName: stockTableName,
        IndexName: 'medicineId-index',
        KeyConditionExpression: 'medicineId = :medicineId',
        ExpressionAttributeValues: {
          ':medicineId': queryParams.medicineId
        }
      }).promise();
      stocks = result.Items;
    } else if (queryParams.vendorId) {
      // List stocks by vendorId (and optionally purchaseDate)
      if (!stockTableName) {
        throw new Error('medicineType is required when searching by vendorId');
      }
      
      let keyCondition = 'vendorId = :vendorId';
      let expressionValues = { ':vendorId': queryParams.vendorId };
      
      if (queryParams.purchaseDate) {
        keyCondition += ' AND purchaseDate = :purchaseDate';
        expressionValues[':purchaseDate'] = queryParams.purchaseDate;
      }
      
      const result = await dynamodb.query({
        TableName: stockTableName,
        IndexName: 'vendorId-index',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues
      }).promise();
      stocks = result.Items;
    } else if (queryParams.purchaseDate) {
      // List stocks by purchaseDate
      if (!stockTableName) {
        throw new Error('medicineType is required when searching by purchaseDate');
      }
      
      const result = await dynamodb.query({
        TableName: stockTableName,
        IndexName: 'purchaseDate-index',
        KeyConditionExpression: 'purchaseDate = :purchaseDate',
        ExpressionAttributeValues: {
          ':purchaseDate': queryParams.purchaseDate
        }
      }).promise();
      stocks = result.Items;
    } else if (queryParams.tradeName) {
      // List stocks by tradeName
      if (!stockTableName) {
        throw new Error('medicineType is required when searching by tradeName');
      }
      
      const result = await dynamodb.query({
        TableName: stockTableName,
        IndexName: 'tradeName-index',
        KeyConditionExpression: 'tradeName = :tradeName',
        ExpressionAttributeValues: {
          ':tradeName': queryParams.tradeName
        }
      }).promise();
      stocks = result.Items;
    } else if (queryParams.medicineName) {
      // List stocks by medicineName (need to first find medicineId from medicine table)
      const medicines = await dynamodb.scan({
        TableName: TABLE_MEDICINE,
        FilterExpression: 'contains(medicineName, :name)',
        ExpressionAttributeValues: {
          ':name': queryParams.medicineName
        }
      }).promise();
      
      if (medicines.Items && medicines.Items.length > 0) {
        // If medicineType is specified, query only that table
        if (medicineType) {
          const medicineIds = medicines.Items.map(m => m.medicineId);
          const batchGetPromises = medicineIds.map(medicineId => 
            dynamodb.query({
              TableName: stockTableName,
              IndexName: 'medicineId-index',
              KeyConditionExpression: 'medicineId = :medicineId',
              ExpressionAttributeValues: {
                ':medicineId': medicineId
              }
            }).promise()
          );
          
          const results = await Promise.all(batchGetPromises);
          stocks = results.flatMap(r => r.Items);
        } else {
          // If no medicineType specified, query all stock tables
          const allStockTables = ['tablet', 'syrup', 'drops', 'respules', 'injection', 'ointment', 'surgicals', 'fluids']
            .map(type => getStockTableName(type));
          
          const batchGetPromises = medicines.Items.flatMap(medicine => 
            allStockTables.map(tableName => 
              dynamodb.query({
                TableName: tableName,
                IndexName: 'medicineId-index',
                KeyConditionExpression: 'medicineId = :medicineId',
                ExpressionAttributeValues: {
                  ':medicineId': medicine.medicineId
                }
              }).promise()
            )
          );
          
          const results = await Promise.all(batchGetPromises);
          stocks = results.flatMap(r => r.Items);
        }
      }
    } else {
      // List all stocks (with optional medicineType filter)
      if (stockTableName) {
        const result = await dynamodb.scan({
          TableName: stockTableName
        }).promise();
        stocks = result.Items;
      } else {
        // If no medicineType specified, scan all stock tables
        const allStockTables = ['tablet', 'syrup', 'drops', 'respules', 'injection', 'ointment', 'surgicals', 'fluids']
          .map(type => getStockTableName(type));
        
        const scanPromises = allStockTables.map(tableName => 
          dynamodb.scan({ TableName: tableName }).promise()
        );
        
        const results = await Promise.all(scanPromises);
        stocks = results.flatMap(r => r.Items);
      }
    }
    if (stocks.length > 0) {
  const vendorIds = [...new Set(stocks.map(s => s.vendorId).filter(Boolean))];
  if (vendorIds.length > 0) {
    const vendorKeys = vendorIds.map(id => ({ vendorId: id }));
    const vendorData = await dynamodb.batchGet({
      RequestItems: {
        [TABLE_VENDOR]: {
          Keys: vendorKeys
        }
      }
    }).promise();
    const vendorMap = {};
    (vendorData.Responses[TABLE_VENDOR] || []).forEach(v => {
      vendorMap[v.vendorId] = v.vendorName;
    });
    stocks = stocks.map(stock => ({
      ...stock,
      vendorName: vendorMap[stock.vendorId] || null
    }));
  }
}
    return success(stocks);
  } catch (err) {
    return error(err);
  }
};
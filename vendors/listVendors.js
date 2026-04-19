const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');
const TABLE_VENDOR = process.env.VENDOR_TABLE;
module.exports.handler = async (event) => {
  try {
    const queryParams = event.queryStringParameters || {};
    let vendors;
    
    // List all vendors without filtering
    const result = await dynamodb.scan({
      TableName: TABLE_VENDOR
    }).promise();
    vendors = result.Items || [];
    
    return success(vendors);
  } catch (err) {
    return error(err);
  }
};
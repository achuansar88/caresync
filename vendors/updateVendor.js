const { dynamodb, updateItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateVendor } = require('../utils/validations');
const { formatDate } = require('../utils');

const TABLE_VENDOR = process.env.VENDOR_TABLE;
module.exports.handler = async (event) => {
  try {
    const vendorId = event.pathParameters.vendorId;
    const body = JSON.parse(event.body);
    validateVendor(body);
    
    // Check if vendor exists
    const existingVendor = await dynamodb.get({
      TableName: TABLE_VENDOR,
      Key: { vendorId }
    }).promise();
    
    if (!existingVendor.Item) {
      throw new Error('Vendor not found');
    }
    
    const updateExpression = 'SET vendorName = :name, vendorAddress = :address, ' + 
      'vendorContactNumber = :contact, lastUpdatedDate = :updated';
    
    const expressionAttributeValues = {
      ':name': body.vendorName.toUpperCase(),
      ':address': body.vendorAddress,
      ':contact': body.vendorContactNumber,
      ':updated': formatDate(new Date().toISOString())
    };
    
    const updatedVendor = await updateItem(
      TABLE_VENDOR,
      { vendorId },
      updateExpression,
      expressionAttributeValues
    );
    
    return success(updatedVendor.Attributes);
  } catch (err) {
    return error(err);
  }
};

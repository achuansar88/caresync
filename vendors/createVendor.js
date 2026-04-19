const { sendResponse } = require('../utils');
const { dynamodb, putItem } = require('../utils/db');
const { validateVendor, generateId } = require('../utils/validations');
const { formatDate } = require('../utils');

const TABLE_VENDOR = process.env.VENDOR_TABLE;
module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    validateVendor(body);
    
    // Check for duplicate vendor
    const existingVendor = await dynamodb.scan({
      TableName: TABLE_VENDOR,
      FilterExpression: 'vendorName = :name AND vendorContactNumber = :contact',
      ExpressionAttributeValues: {
        ':name': body.vendorName.toUpperCase(),
        ':contact': body.vendorContactNumber
      }
    }).promise();
    
    if (existingVendor.Items && existingVendor.Items.length > 0) {
      throw new Error('Vendor with same name and contact number already exists');
    }
    
    const vendorId = generateId();
    const now = formatDate(new Date().toISOString());
    const vendor = {
      vendorId,
      vendorName: body.vendorName.toUpperCase(),
      vendorAddress: body.vendorAddress,
      vendorContactNumber: body.vendorContactNumber,
      isActive: true,
      createdDate: now,
      lastUpdatedDate: now
    };
    
    await putItem(TABLE_VENDOR, vendor);
      return sendResponse(201, {
          message: 'Vendor created', data: vendor
      });
  } catch (err) {
    console.log("Error: ", err);
      return sendResponse(500, {
          message: 'Vendor creation failed', error: err.message
      });
  }
};

const { dynamodb, updateItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { formatDate } = require('../utils');
const TABLE_VENDOR = process.env.VENDOR_TABLE;
module.exports.handler = async (event) => {
    try {
        const vendorId = event.pathParameters.vendorId;

        // Check if vendor exists
        const existingVendor = await dynamodb.get({
            TableName: TABLE_VENDOR,
            Key: { vendorId }
        }).promise();

        if (!existingVendor.Item) {
            throw new Error('Vendor not found');
        }

        // Soft delete by setting isActive to false
        const updatedVendor = await updateItem(
            TABLE_VENDOR,
            { vendorId },
            'SET isActive = :active, lastUpdatedDate = :updated',
            {
                ':active': false,
                ':updated': formatDate(new Date().toISOString())
            }
        );

        return success({ message: 'Vendor deactivated successfully' });
    } catch (err) {
        return error(err);
    }
};

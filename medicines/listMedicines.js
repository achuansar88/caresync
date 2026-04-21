const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');
const TABLE_MEDICINE = process.env.MEDICINE_TABLE;

const sortMedicines = (items = []) =>
  [...items].sort((a, b) => {
    const aDate = new Date(a.lastUpdatedDateTime || a.createdDateTime || 0).getTime();
    const bDate = new Date(b.lastUpdatedDateTime || b.createdDateTime || 0).getTime();

    if (bDate !== aDate) return bDate - aDate;
    return String(a.medicineName || '').localeCompare(String(b.medicineName || ''));
  });

module.exports.handler = async (event) => {
  try {
    const queryParams = event.queryStringParameters || {};
    const searchName = queryParams.medicineName?.trim();
    const medicineType = queryParams.medicineType?.trim();
    const medicineId = queryParams.medicineId?.trim();
    const limit = parseInt(queryParams.limit || '0', 10);
    const isPaginated = Boolean(queryParams.limit || queryParams.lastEvaluatedKey);
    const restockFilter = queryParams.restockFilter === 'true';

    if (medicineId) {
      const result = await dynamodb.get({
        TableName: TABLE_MEDICINE,
        Key: { medicineId }
      }).promise();

      if (!result.Item || result.Item.isDelete) {
        return success(null);
      }

      return success(result.Item);
    }

    const scanParams = {
      TableName: TABLE_MEDICINE,
      FilterExpression: 'isDelete = :delete',
      ExpressionAttributeValues: {
        ':delete': false
      }
    };

    if (searchName) {
      scanParams.FilterExpression += ' AND contains(medicineName, :name)';
      scanParams.ExpressionAttributeValues[':name'] = searchName.toUpperCase();
    }

    if (medicineType) {
      scanParams.FilterExpression += ' AND medicineType = :type';
      scanParams.ExpressionAttributeValues[':type'] = medicineType.toLowerCase();
    }

    if (restockFilter) {
      scanParams.FilterExpression += ' AND balanceQuantity <= minStockCount';
    }

    if (limit > 0) {
      scanParams.Limit = limit;
    }

    if (queryParams.lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = JSON.parse(queryParams.lastEvaluatedKey);
    }

    const result = await dynamodb.scan(scanParams).promise();
    const medicines = sortMedicines(result.Items || []);

    if (isPaginated) {
      return success({
        items: medicines,
        lastEvaluatedKey: result.LastEvaluatedKey
          ? JSON.stringify(result.LastEvaluatedKey)
          : null,
      });
    }

    return success(medicines);
  } catch (err) {
    return error(err);
  }
};

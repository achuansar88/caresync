const { formatDate } = require('../utils');
const { dynamodb, putItem, getStockTableName } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { validateStock, generateId } = require('../utils/validations');
const TABLE_MEDICINE = process.env.MEDICINE_TABLE;
const TABLE_VENDOR = process.env.VENDOR_TABLE;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    // Check if medicine exists
    const medicine = await dynamodb.get({
      TableName: TABLE_MEDICINE,
      Key: { medicineId: body.medicineId }
    }).promise();
    
    if (!medicine.Item) {
      throw new Error('Medicine not found');
    }
    const medicineType = medicine.Item.medicineType;
    validateStock(body, medicineType);
    
    // Check if vendor exists
    const vendor = await dynamodb.get({
      TableName: TABLE_VENDOR,
      Key: { vendorId: body.vendorId }
    }).promise();
    
    if (!vendor.Item || !vendor.Item.isActive) {
      throw new Error('Vendor not found or inactive');
    }
    
    // Prepare stock item based on medicine type
    const stockId = generateId();
    const now = formatDate(new Date().toISOString());
    let stockItem = {
      stockId,
      medicineId: body.medicineId,
      vendorId: body.vendorId,
      tradeName: body.tradeName,
      expiryDate: formatDate(body.expiryDate),
      purchaseDate: formatDate(body.purchaseDate).split('T')[0],
      createdDate: now,
      lastUpdatedDate: now,
      // store original totalRate and gstPercent; totalRate will be adjusted to include GST
      totalRateOriginal: Number(body.totalRate) || 0,
      gstPercent: Number(body.gstPercent) || 1
    };
   
    // common helpers
    const totalQuantity = (p1 = 1, p2 = 1, p3 = 1) => Number(p1 || 1) * Number(p2 || 1) * Number(p3 || 1);
    // compute per-unit rate using totalRate (preferred) or fallback rate/count (for tablets)
    const computePerUnitRateWithGst = (totalRate, qty, gstPercent, fallbackRate, countPerStrip) => {
      const gst = Number(gstPercent || 0);
      let perUnit = 0;
      if (totalRate && qty > 0) {
        perUnit = Number(totalRate) / Number(qty);
      } else if (fallbackRate && countPerStrip) {
        perUnit = Number(fallbackRate) / Number(countPerStrip);
      }
      // apply GST on per unit
      perUnit = perUnit + (perUnit * gst / 100);
      return Number(perUnit);
    };
    // compute totalRate including GST
    const computeTotalRateWithGst = (totalRate, gstPercent) => {
      const t = Number(totalRate || 0);
      const gst = Number(gstPercent || 0);
      return t + (t * gst / 100);
    };
    
    let totalQuantityI;
    // Add type-specific fields
    switch (medicineType) {
      case 'tablet':
        stockItem.totalStrips = body.totalStrips;
        stockItem.countPerStrip = body.countPerStrip;
        stockItem.mrpPerStrip = body.mrpPerStrip;
        totalQuantityI = totalQuantity(body.totalStrips, body.countPerStrip);
        stockItem.totalQuantity = totalQuantityI;
        // Prefer using totalRateOriginal if provided otherwise fall back to body.rate/countPerStrip
        const totalRateWithGst_tab = computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent);
        stockItem.totalRate = Number(totalRateWithGst_tab.toFixed(2));
        stockItem.ratePerItem = computePerUnitRateWithGst(
          stockItem.totalRateOriginal,
          totalQuantityI,
          stockItem.gstPercent,
          body.rate,
          body.countPerStrip
        ).toFixed(2);
        stockItem.mrpPerItem = Number(body.mrpPerStrip / (Number(body.countPerStrip) || 1)).toFixed(2);
        break;
      case 'capsule':
        stockItem.totalStrips = body.totalStrips;
        stockItem.countPerStrip = body.countPerStrip;
        stockItem.mrpPerStrip = body.mrpPerStrip;
        totalQuantityI = totalQuantity(body.totalStrips, body.countPerStrip);
        stockItem.totalQuantity = totalQuantityI;
        // Prefer using totalRateOriginal if provided otherwise fall back to body.rate/countPerStrip
        const totalRateWithGst_cap = computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent);
        stockItem.totalRate = Number(totalRateWithGst_cap.toFixed(2));
        stockItem.ratePerItem = computePerUnitRateWithGst(
          stockItem.totalRateOriginal,
          totalQuantityI,
          stockItem.gstPercent,
          body.rate,
          body.countPerStrip
        ).toFixed(2);
        stockItem.mrpPerItem = Number(body.mrpPerStrip / (Number(body.countPerStrip) || 1)).toFixed(2);
        break;
      case 'syrup':
        stockItem.totalBox = body.totalBox;
        stockItem.bottlePerBox = body.bottlePerBox;
        stockItem.mrpPerBottle = body.mrpPerBottle;
        totalQuantityI = totalQuantity(body.totalBox, body.bottlePerBox);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerBottle = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'drops':
        stockItem.totalBox = body.totalBox;
        stockItem.dropsPerBox = body.dropsPerBox;
        stockItem.mrpPerDrops = body.mrpPerDrops;
        totalQuantityI = totalQuantity(body.totalBox, body.dropsPerBox);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerDrop = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'respules':
        stockItem.totalBox = body.totalBox;
        stockItem.respulesSheetPerBox = body.respulesSheetPerBox;
        stockItem.respulesItemPerSheet = body.respulesItemPerSheet;
        stockItem.mrpPerRespule = body.mrpPerRespule;
        totalQuantityI = totalQuantity(body.totalBox, body.respulesSheetPerBox, body.respulesItemPerSheet);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerRespule = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'injection':
        stockItem.totalInjectionsSheet = body.totalInjectionsSheet;
        stockItem.injectionsPerSheet = body.injectionsPerSheet;
        stockItem.mrpPerInjections = body.mrpPerInjections;
        totalQuantityI = totalQuantity(body.totalInjectionsSheet, body.injectionsPerSheet);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerInjection = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'ointment':
        stockItem.totalBox = body.totalBox;
        stockItem.tubePerBox = body.tubePerBox;
        stockItem.mrpPerTube = body.mrpPerTube;
        totalQuantityI = totalQuantity(body.totalBox, body.tubePerBox);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerOintment = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'surgicals':
        stockItem.totalSurgicalBox = body.totalSurgicalBox;
        stockItem.piecesPerBox = body.piecesPerBox;
        stockItem.mrpPerPiece = body.mrpPerPiece;
        totalQuantityI = totalQuantity(body.totalSurgicalBox, body.piecesPerBox);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerPiece = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'fluids':
        stockItem.totalFluidBox = body.totalFluidBox;
        stockItem.fluidsPerBox = body.fluidsPerBox;
        stockItem.mrpPerFluid = body.mrpPerFluid;
        totalQuantityI = totalQuantity(body.totalFluidBox, body.fluidsPerBox);
        stockItem.totalQuantity = totalQuantityI;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerFluid = computePerUnitRateWithGst(stockItem.totalRateOriginal, totalQuantityI, stockItem.gstPercent).toFixed(2);
        break;
      case 'other':
        stockItem.totalQuantity = body.totalQuantity;
        stockItem.mrpPerItem = body.mrpPerItem;
        stockItem.totalRate = Number(computeTotalRateWithGst(stockItem.totalRateOriginal, stockItem.gstPercent).toFixed(2));
        stockItem.ratePerItem = computePerUnitRateWithGst(stockItem.totalRateOriginal, stockItem.totalQuantity, stockItem.gstPercent).toFixed(2);
        break;
    }
    stockItem.balanceQuantity = stockItem.totalQuantity;
    // Add to appropriate stock table
    const stockTableName = getStockTableName(medicineType);
    await putItem(stockTableName, stockItem);
    
    // Update medicine balance quantity
    const newBalance = (medicine.Item.balanceQuantity || 0) + stockItem.totalQuantity;
    await dynamodb.update({
      TableName: TABLE_MEDICINE,
      Key: { medicineId: body.medicineId },
      UpdateExpression: 'SET balanceQuantity = :balance, lastUpdatedDateTime = :updated',
      ExpressionAttributeValues: {
        ':balance': newBalance,
        ':updated': now
      }
    }).promise();
    
    return success(stockItem, 201);
  } catch (err) {
    return error(err);
  }
};

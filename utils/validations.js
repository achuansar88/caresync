const { v4: uuidv4 } = require('uuid');
const { MEDICINE_TYPES } = require('./db');

module.exports = {
  generateId: () => uuidv4(),
  validateVendor: (vendor) => {
    if (!vendor.vendorName || !vendor.vendorAddress || !vendor.vendorContactNumber) {
      throw new Error('Vendor name, address and contact number are required');
    }
    
    // Validate contact number (simple validation for 10 digits)
    const contactRegex = /^\d{10}$/;
    if (!contactRegex.test(vendor.vendorContactNumber)) {
      throw new Error('Contact number must be 10 digits');
    }
    
    return true;
  },
  validateMedicine: (medicine) => {
    if (!medicine.medicineName || !medicine.medicineType) {
      throw new Error('Medicine name and type are required');
    }
    
    if (!MEDICINE_TYPES.includes(medicine.medicineType.toLowerCase())) {
      throw new Error(`Invalid medicine type. Allowed types: ${MEDICINE_TYPES.join(', ')}`);
    }

    const minStockCount = Number(medicine.minStockCount);
    if (Number.isNaN(minStockCount) || minStockCount < 0) {
      throw new Error('Min stock count must be 0 or greater');
    }
    
    return true;
  },
  validateStock: (stock, medicineType) => {
    if (!stock.medicineId || !stock.vendorId || !stock.tradeName || !stock.expiryDate || 
        !stock.purchaseDate || !stock.rate || !stock.totalRate || !stock.gstPercent) {
      throw new Error('Missing required fields for stock');
    }
    
    // Type-specific validations
    switch (medicineType.toLowerCase()) {
      case 'tablet':
        if (!stock.totalStrips || !stock.countPerStrip || !stock.mrpPerStrip) {
          throw new Error('For tablets, totalStrips, countPerStrip and mrpPerStrip are required');
        }
        break;
      case 'syrup':
        if (!stock.totalBox || !stock.bottlePerBox || !stock.mrpPerBottle) {
          throw new Error('For syrup, totalBox, bottlePerBox and mrpPerBottle are required');
        }
        break;
      case 'drops':
        if (!stock.totalBox || !stock.dropsPerBox || !stock.mrpPerDrops) {
          throw new Error('For drops, totalBox, dropsPerBox and mrpPerDrops are required');
        }
        break;
      case 'respules':
        if (!stock.totalBox || !stock.respulesSheetPerBox  || !stock.respulesItemPerSheet || !stock.mrpPerRespule) {
          throw new Error('For respules, totalBox, respulesSheetPerBox, respulesItemPerSheet and mrpPerRespules are required');
        }
        break;
      case 'injection':
        if (!stock.totalInjectionsSheet || !stock.injectionsPerSheet || !stock.mrpPerInjections) {
          throw new Error('For injections, totalInjectionsSheet, injectionsPerSheet and mrpPerInjections are required');
        }
        break;
      case 'ointment':
        if (!stock.totalBox || !stock.tubePerBox || !stock.mrpPerTube) {
          throw new Error('For ointment, totalBox, tubePerBox and mrpPerTube are required');
        }
        break;
      case 'surgicals':
        if (!stock.totalSurgicalBox || !stock.piecesPerBox || !stock.mrpPerPiece) {
          throw new Error('For surgicals, totalSurgicalBox, piecesPerBox and mrpPerPiece are required');
        }
        break;
      case 'fluids':
        if (!stock.totalFluidBox || !stock.fluidsPerBox || !stock.mrpPerFluid) {
          throw new Error('For fluids, totalFluidBox, fluidsPerBox and mrpPerFluid are required');
        }
      break;
      case 'capsule':
         if (!stock.totalStrips || !stock.countPerStrip || !stock.mrpPerStrip) {
          throw new Error('For capsule, totalStrips, countPerStrip and mrpPerStrip are required');
        }
      break;
      case 'other':
        if (!stock.totalQuantity || !stock.mrpPerItem) {
          throw new Error('For other medicine types, totalQuantity and mrpPerItem are required');
        }
      default:
        throw new Error(`Invalid medicine type: ${medicineType}`);
    }
    
    return true;
  }
};

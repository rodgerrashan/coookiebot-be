(async function(){
  try{
    process.chdir(__dirname.replace('/scripts',''));
    require('dotenv').config();
    const { getSymbolsDeriv, getMultipliersDeriv } = require('../services/deriv/candlesService');
    const symbols = await getSymbolsDeriv();
    console.log('SYMBOLS', symbols.length);
    const multipliers = await getMultipliersDeriv('WLDAUD');
    console.log('MULTIPLIERS', JSON.stringify(multipliers));
    process.exit(0);
  }catch(e){
    console.error('ERR', e && e.message? e.message: e);
    process.exit(1);
  }
})();

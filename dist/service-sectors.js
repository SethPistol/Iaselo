'use strict';

const serviceSectors=Object.freeze({
 'bloc-chir':'Bloc opératoire chirurgical',
 'bloc-endo':'Bloc endoscopique',
 'sspi-chir':'SSPI chirurgicale',
 'sspi-endo':'SSPI endoscopique',
 'ambulatoire':'Ambulatoire',
 'etage-1':'1er étage',
 'etage-2':'2e étage'
});

if(typeof module!=='undefined')module.exports=serviceSectors;

export const SECTION_ORDER = [
  "Groente & Fruit","Vega","Brood","Ontbijt & Smeersels","Zuivel",
  "Pasta & Rijst","Kruiden & Specerijen","Chips & Snacks","Non-food","Diepvries","Toiletartikelen","Eigen"
];

export const MEAL_DATA = {
  "Pizza": ["Pizzadeeg","Gesneden Champignons","Paprika","Paprika","Rode Ui","Tapenade","Cashewnoten"],
  "Sticky Tofu": ["Tofu","Broccoli","Rijst azijn","Maizena","Sojasaus","Knoflook"],
  "Stamppot Spinazie": ["Burger","Kruimige Aardappelen","Spinazie fijn diepvries"],
  "Pasta": ["Paprika","Paprika","Gehakt","Winterpeen","Tomatenpuree","Cherry Tomaten blik","Saus zongedroogde tomaat","Ui wit","Knoflook"],
  "Chili Sin Carne": ["Ui wit","Knoflook","Koriander","Chilipoeder","Komijnzaad","Zoete Aardappels","Zoete Aardappels","Tomatenblokjes (400gr)","Bosui","Bosui","Crème Fraîche (125ml)","Avocado","Maïskorrels (100gr)","Kidneybonen (100gr)"],
  "Couscous Boerenkool": ["Ui wit","Knoflook","Chilipoeder","Boerenkool (300gr)","Couscous (200gr)","Rozijnen (50gr)","Kruidenbouillon (600ml)"]
};

export const WEEKLY_GROUPS = {
  "Ontbijt & Lunch": ["Brood","Pindakaas","Hagelslag","Sojayoghurt","Havermout","Havermelk","Cruesli","Hummus","Rozijnen (50gr)"],
  "Toiletartikelen": ["Toiletpapier","Zeep","Wasmiddel","Shampoo","Tandpasta","Afwasmiddel","Keukenpapier"],
  "Vers": ["Blauwe Bessen","Bananen","Avocado"],
  "Meisjes": ["Groenvoer","Hooi","Brokjes"],
  "Baby": ["Luiers","Babydoekjes","Kunstvoeding"],
  "Appelschilletjes": ["Chocola","Chips","Big Hit","Drop","Apekoppen"]
};

export const ITEM_TO_SECTION = {
  "Kruimige Aardappelen":"Groente & Fruit","Paprika":"Groente & Fruit","Rode Ui":"Groente & Fruit","Ui wit":"Groente & Fruit",
  "Knoflook":"Groente & Fruit","Broccoli":"Groente & Fruit","Zoete Aardappels":"Groente & Fruit","Gesneden Champignons":"Groente & Fruit",
  "Bosui":"Groente & Fruit","Avocado":"Groente & Fruit","Blauwe Bessen":"Groente & Fruit","Bananen":"Groente & Fruit","Winterpeen":"Groente & Fruit",
  "Boerenkool (300gr)":"Groente & Fruit","Groenvoer":"Groente & Fruit",
  "Tofu":"Vega","Burger":"Vega","Gehakt":"Vega",
  "Brood":"Brood","Pizzadeeg":"Brood",
  "Pindakaas":"Ontbijt & Smeersels","Hagelslag":"Ontbijt & Smeersels","Sojayoghurt":"Ontbijt & Smeersels",
  "Havermout":"Ontbijt & Smeersels","Havermelk":"Ontbijt & Smeersels","Cruesli":"Ontbijt & Smeersels",
  "Tapenade":"Ontbijt & Smeersels","Hummus":"Ontbijt & Smeersels","Rozijnen (50gr)":"Ontbijt & Smeersels",
  "Crème Fraîche (125ml)":"Zuivel",
  "Rijst azijn":"Pasta & Rijst","Maizena":"Pasta & Rijst","Sojasaus":"Pasta & Rijst",
  "Tomatenpuree":"Pasta & Rijst","Saus zongedroogde tomaat":"Pasta & Rijst","Cherry Tomaten blik":"Pasta & Rijst",
  "Tomatenblokjes (400gr)":"Pasta & Rijst","Couscous (200gr)":"Pasta & Rijst","Kruidenbouillon (600ml)":"Pasta & Rijst",
  "Chilipoeder":"Kruiden & Specerijen","Komijnzaad":"Kruiden & Specerijen","Koriander":"Kruiden & Specerijen",
  "Cashewnoten":"Chips & Snacks","Chocola":"Chips & Snacks","Chips":"Chips & Snacks","Big Hit":"Chips & Snacks","Drop":"Chips & Snacks","Apekoppen":"Chips & Snacks",
  "Hooi":"Non-food","Brokjes":"Non-food","Luiers":"Non-food","Babydoekjes":"Non-food","Kunstvoeding":"Non-food",
  "Spinazie fijn diepvries":"Diepvries",
  "Toiletpapier":"Toiletartikelen","Zeep":"Toiletartikelen","Wasmiddel":"Toiletartikelen",
  "Shampoo":"Toiletartikelen","Tandpasta":"Toiletartikelen","Afwasmiddel":"Toiletartikelen","Keukenpapier":"Toiletartikelen"
};

export function normalize(s){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,""); }
export function inferSection(name){ return ITEM_TO_SECTION[name] || "Eigen"; }
export function suggestMatches(query, pool, limit=8){
  const q = normalize(query).trim();
  if(!q) return [];
  const starts = pool.filter(x => normalize(x).startsWith(q));
  const incl   = pool.filter(x => normalize(x).includes(q) && !starts.includes(x));
  return [...starts, ...incl].slice(0, limit);
}

// Fictional catalogue used to generate sample data. Every brand, supplier and
// barcode is invented (generated barcodes may coincidentally match real
// products, so never use them for real trading). Prices are typical UK shelf
// prices, including VAT, in late 2026.

export type VatCode = "Z" | "R" | "S";

export type SupplierKey =
  "dairy" | "produce" | "bakery" | "meat" | "wholesale" | "drinks";

export const VAT_RATES: Record<VatCode, number> = { Z: 0, R: 0.05, S: 0.2 };

export interface SupplierSeed {
  key: SupplierKey;
  name: string;
  accountNumber: string;
  /** Ofcom's 01632 960xxx range is reserved for fiction. */
  phone: string;
  /** .example domains are reserved and never deliver mail. */
  email: string;
  paymentTermsDays: number;
  deliveryDays: string;
  leadTimeDays: number;
  /** Prefix for the supplier's own product codes ("" = plain numbers). */
  codePrefix: string;
}

export interface ProductSeed {
  name: string;
  size: string;
  /** Shelf price including VAT; per kg when sold by weight. */
  price: number;
  /** Average units (or kg) sold per day. */
  daily: number;
  /** Units (or kg) in one supplier case. */
  caseUnits: number;
  brand?: string;
  soldBy?: "each" | "kg";
  vat?: VatCode;
  /** Sold on a till key instead of a barcode (loose or in-store items). */
  noBarcode?: boolean;
}

export interface CategorySeed {
  /** "Department > Category" */
  path: string;
  supplier: SupplierKey;
  /** Target gross margin on the ex-VAT selling price. */
  margin: number;
  vat: VatCode;
  brand: string;
  products: ProductSeed[];
}

/** One product per line: name, size, price, daily sales, case size. */
const p = (
  name: string,
  size: string,
  price: number,
  daily: number,
  caseUnits: number,
  extra: Pick<ProductSeed, "brand" | "soldBy" | "vat" | "noBarcode"> = {},
): ProductSeed => ({ name, size, price, daily, caseUnits, ...extra });

/** Loose produce sold by weight: price per kg, kg per day, kg per box. */
const loose = (
  name: string,
  pricePerKg: number,
  dailyKg: number,
  boxKg: number,
) =>
  p(name, "Loose", pricePerKg, dailyKg, boxKg, {
    soldBy: "kg",
    noBarcode: true,
    brand: "",
  });

export const suppliers: SupplierSeed[] = [
  {
    key: "dairy",
    name: "Fresh Dairy Ltd",
    accountNumber: "FD-20417",
    phone: "01632 960101",
    email: "orders@freshdairy.example",
    paymentTermsDays: 14,
    deliveryDays: "Mon-Sat",
    leadTimeDays: 1,
    codePrefix: "FD",
  },
  {
    key: "produce",
    name: "Valley Foods Ltd",
    accountNumber: "VF-88213",
    phone: "01632 960102",
    email: "orders@valleyfoods.example",
    paymentTermsDays: 14,
    deliveryDays: "Mon-Sat",
    leadTimeDays: 1,
    codePrefix: "VF",
  },
  {
    key: "bakery",
    name: "Hearthstone Bakery Ltd",
    accountNumber: "HB-3390",
    phone: "01632 960103",
    email: "orders@hearthstonebakery.example",
    paymentTermsDays: 7,
    deliveryDays: "Daily",
    leadTimeDays: 1,
    codePrefix: "HB",
  },
  {
    key: "meat",
    name: "Copperfield Meats Ltd",
    accountNumber: "CM-11872",
    phone: "01632 960104",
    email: "orders@copperfieldmeats.example",
    paymentTermsDays: 14,
    deliveryDays: "Mon, Wed, Fri",
    leadTimeDays: 2,
    codePrefix: "CM",
  },
  {
    key: "wholesale",
    name: "Central Wholesale Ltd",
    accountNumber: "700451",
    phone: "01632 960105",
    email: "orders@centralwholesale.example",
    paymentTermsDays: 30,
    deliveryDays: "Tue, Fri",
    leadTimeDays: 3,
    codePrefix: "",
  },
  {
    key: "drinks",
    name: "Harbourside Drinks Ltd",
    accountNumber: "HD-5521",
    phone: "01632 960106",
    email: "orders@harbourside.example",
    paymentTermsDays: 30,
    deliveryDays: "Thu",
    leadTimeDays: 3,
    codePrefix: "HD",
  },
];

export const categories: CategorySeed[] = [
  {
    path: "Fresh Produce > Fruit",
    supplier: "produce",
    margin: 0.35,
    vat: "Z",
    brand: "Greenfurrow",
    products: [
      loose("Bananas", 0.98, 22, 18),
      loose("Gala Apples", 2.4, 6, 12),
      p("Easy Peeler Clementines", "600g", 1.65, 10, 10),
      p("Red Seedless Grapes", "500g", 2.25, 9, 10),
      p("Strawberries", "400g", 2.5, 10, 10),
      p("Blueberries", "150g", 1.99, 7, 12),
      p("Lemons", "4 pack", 1.0, 5, 12),
      p("Ripe Avocados", "2 pack", 1.89, 5, 10),
      p("Pineapple", "Each", 1.4, 2, 8),
      p("Conference Pears", "4 pack", 1.75, 3, 10),
    ],
  },
  {
    path: "Fresh Produce > Vegetables",
    supplier: "produce",
    margin: 0.35,
    vat: "Z",
    brand: "Greenfurrow",
    products: [
      p("White Potatoes", "2.5kg", 1.79, 8, 6),
      p("Carrots", "1kg", 0.85, 8, 10),
      loose("Brown Onions", 1.2, 5, 10),
      loose("Sweet Potatoes", 1.9, 3, 10),
      p("Broccoli", "Each", 0.89, 9, 10),
      p("Cucumber", "Each", 0.85, 8, 12),
      p("Iceberg Lettuce", "Each", 0.95, 5, 10),
      p("Salad Tomatoes", "6 pack", 1.15, 8, 10),
      p("Cherry Tomatoes", "250g", 1.25, 7, 10),
      p("Closed Cup Mushrooms", "300g", 1.29, 7, 10),
      p("Mixed Peppers", "3 pack", 1.75, 6, 10),
      p("Garlic", "4 pack", 0.89, 3, 10),
      p("Spring Onions", "Bunch", 0.69, 3, 12),
      p("Baby Spinach", "200g", 1.5, 3, 8),
      p("Mixed Leaf Salad", "120g", 1.0, 4, 10),
    ],
  },
  {
    path: "Bakery > Bread & Rolls",
    supplier: "bakery",
    margin: 0.3,
    vat: "Z",
    brand: "Hearthstone",
    products: [
      p("White Sliced Bread", "800g", 1.45, 25, 12),
      p("Wholemeal Sliced Bread", "800g", 1.55, 14, 12),
      p("Thick Sliced White Bread", "800g", 1.45, 10, 12),
      p("Seeded Batch Loaf", "800g", 1.95, 6, 12),
      p("White Bread Rolls", "6 pack", 1.1, 8, 12),
      p("Plain Tortilla Wraps", "8 pack", 1.6, 5, 12),
      p("Crumpets", "6 pack", 0.95, 6, 12),
      p("All Butter Croissants", "4 pack", 1.75, 5, 10),
      p("Fruited Teacakes", "4 pack", 1.2, 2, 12),
      p("Plain Bagels", "5 pack", 1.4, 3, 12),
      p("White Bread", "800g", 0.75, 9, 12, { brand: "Thrift & Co" }),
      p("Jam Doughnut", "Each", 0.6, 6, 12, { brand: "", noBarcode: true }),
    ],
  },
  {
    path: "Bakery > Cakes",
    supplier: "bakery",
    margin: 0.33,
    vat: "Z",
    brand: "Hearthstone",
    products: [
      p("Chocolate Sponge Roll", "Each", 1.65, 2, 12),
      p("Victoria Sponge Cake", "Each", 2.75, 1, 6),
      p("Lemon Drizzle Slices", "6 pack", 1.5, 2, 12),
      // Seasonal: no sales yet in September and October.
      p("Christmas Pudding", "454g", 3.5, 0, 6),
    ],
  },
  {
    path: "Dairy & Eggs > Milk & Cream",
    supplier: "dairy",
    margin: 0.2,
    vat: "Z",
    brand: "Brookmere Dairy",
    products: [
      p("Semi-Skimmed Milk", "2L", 1.75, 38, 8),
      p("Semi-Skimmed Milk", "1L", 1.1, 12, 12),
      p("Whole Milk", "2L", 1.75, 14, 8),
      p("Skimmed Milk", "2L", 1.75, 6, 8),
      // Plant-based drinks are standard-rated, unlike dairy milk.
      p("Oat Drink", "1L", 1.8, 4, 6, { brand: "Oatfield", vat: "S" }),
      p("Double Cream", "300ml", 1.4, 4, 12),
      p("Single Cream", "300ml", 1.25, 2, 12),
    ],
  },
  {
    path: "Dairy & Eggs > Cheese",
    supplier: "dairy",
    margin: 0.24,
    vat: "Z",
    brand: "Fellside",
    products: [
      p("Mature Cheddar", "400g", 4.25, 9, 12),
      p("Mild Cheddar", "400g", 3.95, 5, 12),
      p("Grated Mozzarella & Cheddar", "250g", 2.5, 4, 10),
      p("Mozzarella", "125g", 0.95, 5, 12),
      p("Halloumi", "225g", 2.75, 2, 10),
      p("Cheese Slices", "10 pack", 1.85, 3, 12),
      p("Soft Cheese", "180g", 1.3, 4, 12),
      p("Italian Hard Cheese", "100g", 2.4, 0.4, 10),
    ],
  },
  {
    path: "Dairy & Eggs > Yoghurts & Desserts",
    supplier: "dairy",
    margin: 0.25,
    vat: "Z",
    brand: "Larkspur Farm",
    products: [
      p("Greek Style Yoghurt", "500g", 1.8, 6, 6),
      p("Natural Yoghurt", "500g", 1.1, 3, 6),
      p("Fruit Yoghurts", "4 x 120g", 1.6, 6, 6),
      p("Strawberry Fromage Frais", "6 x 45g", 1.5, 3, 6),
      p("Chocolate Mousse", "4 pack", 1.3, 2, 6),
    ],
  },
  {
    path: "Dairy & Eggs > Butter & Spreads",
    supplier: "dairy",
    margin: 0.22,
    vat: "Z",
    brand: "Brookmere Dairy",
    products: [
      p("Salted Butter", "250g", 2.35, 10, 20),
      p("Unsalted Butter", "250g", 2.35, 2, 20),
      p("Spreadable Butter", "500g", 3.5, 6, 12),
      p("Sunflower Spread", "500g", 1.6, 4, 12),
    ],
  },
  {
    path: "Dairy & Eggs > Eggs",
    supplier: "dairy",
    margin: 0.22,
    vat: "Z",
    brand: "Hillside Hens",
    products: [
      p("Free Range Medium Eggs", "6 pack", 2.1, 14, 12),
      p("Free Range Large Eggs", "12 pack", 3.85, 6, 6),
      p("Mixed Weight Eggs", "15 pack", 2.75, 4, 6, { brand: "Thrift & Co" }),
    ],
  },
  {
    path: "Meat & Fish > Fresh Meat",
    supplier: "meat",
    margin: 0.25,
    vat: "Z",
    brand: "Copperfield",
    products: [
      p("Chicken Breast Fillets", "650g", 4.99, 12, 8),
      p("Whole Chicken", "1.5kg", 4.75, 4, 6),
      p("Chicken Thighs", "1kg", 3.25, 5, 8),
      p("Lean Beef Mince 5% Fat", "500g", 4.5, 9, 10),
      p("Beef Mince 20% Fat", "500g", 2.85, 7, 10),
      p("Diced Beef", "400g", 4.75, 3, 8),
      p("Pork Sausages", "8 pack", 2.75, 10, 12),
      p("Smoked Back Bacon", "300g", 3.25, 10, 12),
      p("Unsmoked Back Bacon", "300g", 3.25, 5, 12),
      p("Pork Loin Steaks", "4 pack", 3.95, 3, 8),
      p("Lamb Mince", "500g", 4.75, 2, 8),
      p("Beef Burgers", "4 pack", 3.2, 4, 10),
    ],
  },
  {
    path: "Meat & Fish > Cooked Meats",
    supplier: "meat",
    margin: 0.28,
    vat: "Z",
    brand: "Copperfield",
    products: [
      p("Cooked Ham Slices", "125g", 1.6, 9, 12),
      p("Cooked Chicken Slices", "100g", 1.8, 5, 12),
      p("Pepperoni Slices", "70g", 1.35, 3, 12),
      p("Scotch Eggs", "2 pack", 1.75, 2, 12),
    ],
  },
  {
    path: "Meat & Fish > Fish",
    supplier: "meat",
    margin: 0.25,
    vat: "Z",
    brand: "Tidewater",
    products: [
      p("Salmon Fillets", "2 pack", 4.25, 4, 8),
      p("Smoked Salmon", "100g", 3.0, 2, 10),
      p("Cooked King Prawns", "150g", 2.75, 2, 10),
    ],
  },
  {
    path: "Chilled > Ready Meals & Dips",
    supplier: "wholesale",
    margin: 0.3,
    vat: "Z",
    brand: "Weeknight Kitchen",
    products: [
      p("Beef Lasagne", "400g", 3.5, 5, 6),
      p("Chicken Tikka Masala with Rice", "450g", 3.75, 4, 6),
      p("Cottage Pie", "400g", 3.25, 3, 6),
      p("Macaroni Cheese", "400g", 3.0, 3, 6),
      p("Margherita Pizza", "10 inch", 3.0, 4, 6),
      p("Tomato & Basil Soup", "600g", 2.25, 3, 6),
      p("Classic Hummus", "200g", 1.1, 6, 12),
      p("Coleslaw", "300g", 0.95, 4, 12),
    ],
  },
  {
    path: "Frozen > Vegetables & Chips",
    supplier: "wholesale",
    margin: 0.28,
    vat: "Z",
    brand: "Frostholm",
    products: [
      p("Garden Peas", "1kg", 1.5, 5, 10),
      p("Mixed Vegetables", "1kg", 1.4, 2, 10),
      p("Straight Cut Oven Chips", "1.5kg", 2.5, 6, 8),
      p("Potato Waffles", "10 pack", 2.2, 2, 10),
    ],
  },
  {
    path: "Frozen > Meat, Fish & Pizza",
    supplier: "wholesale",
    margin: 0.28,
    vat: "Z",
    brand: "Frostholm",
    products: [
      p("Breaded Fish Fillets", "4 pack", 3.25, 3, 10),
      p("Fish Fingers", "10 pack", 2.25, 4, 12),
      p("Chicken Nuggets", "400g", 2.5, 3, 10),
      p("Quarter Pounder Burgers", "4 pack", 2.75, 2, 10),
      p("Pepperoni Pizza", "400g", 2.5, 4, 8),
      p("Cheese & Tomato Pizza", "400g", 2.2, 3, 8),
    ],
  },
  {
    path: "Frozen > Ice Cream & Desserts",
    supplier: "wholesale",
    margin: 0.28,
    vat: "S",
    brand: "Frostholm",
    products: [
      p("Vanilla Ice Cream", "2L", 2.75, 3, 6),
      p("Chocolate Ice Cream Cones", "4 pack", 2.5, 2, 8),
      p("Fruit Ice Lollies", "10 pack", 2.0, 2, 8),
    ],
  },
  {
    path: "Food Cupboard > Tins & Jars",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Pantry Lane",
    products: [
      p("Baked Beans in Tomato Sauce", "415g", 0.9, 18, 24),
      p("Baked Beans", "410g", 0.4, 8, 24, { brand: "Thrift & Co" }),
      p("Chopped Tomatoes", "400g", 0.6, 10, 24),
      p("Tuna Chunks in Brine", "145g", 1.35, 7, 24),
      p("Cream of Tomato Soup", "400g", 1.1, 6, 24),
      p("Sweetcorn", "326g", 0.8, 4, 24),
      p("Red Kidney Beans", "400g", 0.65, 3, 24),
      p("Chickpeas", "400g", 0.7, 3, 24),
      p("Spaghetti Hoops", "410g", 0.75, 4, 24),
      p("Corned Beef", "340g", 3.25, 0.4, 12),
      p("Peach Slices in Juice", "410g", 0.95, 1.5, 24),
      p("Creamed Rice Pudding", "400g", 0.95, 2, 12),
    ],
  },
  {
    path: "Food Cupboard > Pasta, Rice & Noodles",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Pantry Lane",
    products: [
      p("Fusilli Pasta", "500g", 0.95, 8, 12),
      p("Spaghetti", "500g", 0.95, 7, 12),
      p("Spaghetti", "500g", 0.45, 5, 12, { brand: "Thrift & Co" }),
      p("Long Grain Rice", "1kg", 1.4, 4, 12),
      p("Basmati Rice", "1kg", 2.4, 4, 12),
      p("Microwave Pilau Rice", "250g", 1.25, 5, 12),
      p("Chicken Instant Noodles", "70g", 0.5, 8, 24),
      p("Medium Egg Noodles", "250g", 1.1, 2, 12),
    ],
  },
  {
    path: "Food Cupboard > Breakfast & Spreads",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Pantry Lane",
    products: [
      p("Cornflakes", "500g", 2.25, 5, 10),
      p("Porridge Oats", "1kg", 1.5, 4, 10),
      p("Wheat Biscuits", "24 pack", 3.0, 4, 10),
      p("Crunchy Granola", "500g", 2.75, 2, 10),
      p("Chocolate Hoops", "375g", 2.5, 3, 10),
      p("Strawberry Jam", "454g", 1.4, 2, 12),
      p("Smooth Peanut Butter", "340g", 2.1, 2, 12),
      p("Squeezy Honey", "340g", 2.5, 1.5, 12),
    ],
  },
  {
    path: "Food Cupboard > Tea, Coffee & Hot Drinks",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Morning Kettle",
    products: [
      p("Tea Bags", "80 pack", 2.6, 6, 12),
      p("Tea Bags", "240 pack", 6.5, 2, 6),
      p("Tea Bags", "80 pack", 1.15, 4, 12, { brand: "Thrift & Co" }),
      p("Instant Coffee Granules", "200g", 6.5, 3, 6, {
        brand: "Roastery Row",
      }),
      p("Ground Coffee Medium Roast", "227g", 3.75, 1.5, 6, {
        brand: "Roastery Row",
      }),
      p("Hot Chocolate", "400g", 2.75, 1.5, 6),
    ],
  },
  {
    path: "Food Cupboard > Baking & Cooking",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Pantry Lane",
    products: [
      p("Granulated Sugar", "1kg", 1.1, 4, 10),
      p("Plain Flour", "1.5kg", 1.05, 2, 10),
      p("Self Raising Flour", "1.5kg", 1.05, 2, 10),
      p("Sunflower Oil", "1L", 2.1, 3, 12),
      p("Olive Oil", "500ml", 4.5, 0.6, 6),
      p("Table Salt", "750g", 0.65, 1, 12),
      p("Gravy Granules", "300g", 2.2, 3, 12),
      p("Chicken Stock Cubes", "12 pack", 1.1, 2, 12),
    ],
  },
  {
    path: "Food Cupboard > Sauces & Condiments",
    supplier: "wholesale",
    margin: 0.25,
    vat: "Z",
    brand: "Pantry Lane",
    products: [
      p("Tomato Ketchup", "460g", 1.95, 5, 12),
      p("Mayonnaise", "400ml", 2.25, 4, 12),
      p("Brown Sauce", "450g", 1.8, 1.5, 12),
      p("Tomato & Basil Pasta Sauce", "500g", 1.45, 5, 12),
      p("Tikka Masala Cooking Sauce", "500g", 1.65, 3, 12),
      p("Soy Sauce", "150ml", 1.3, 0.4, 12),
    ],
  },
  {
    path: "Snacks & Confectionery > Crisps & Snacks",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Crunchwell",
    products: [
      p("Ready Salted Crisps", "6 x 25g", 1.95, 7, 12),
      p("Cheese & Onion Crisps", "6 x 25g", 1.95, 6, 12),
      p("Salt & Vinegar Crisps", "6 x 25g", 1.95, 5, 12),
      p("Ready Salted Crisps", "32.5g", 0.95, 10, 32),
      p("Lightly Salted Tortilla Chips", "200g", 1.4, 4, 12),
      p("Salted Peanuts", "200g", 1.6, 2, 12),
      p("Sweet & Salty Popcorn", "80g", 1.25, 2, 12),
      p("Salted Pretzels", "175g", 1.3, 1.5, 12),
    ],
  },
  {
    path: "Snacks & Confectionery > Biscuits & Cakes",
    supplier: "wholesale",
    margin: 0.3,
    vat: "Z",
    brand: "Crumbworth",
    products: [
      p("Digestive Biscuits", "400g", 1.2, 5, 12),
      p("Rich Tea Biscuits", "300g", 0.9, 3, 12),
      // Chocolate-covered biscuits are standard-rated; plain ones are not.
      p("Milk Chocolate Digestives", "300g", 1.75, 5, 12, { vat: "S" }),
      p("Custard Creams", "400g", 0.95, 3, 12),
      p("Chocolate Chip Cookies", "200g", 1.35, 3, 12),
      // Cakes stay zero-rated even with a chocolate topping.
      p("Orange Jelly Cakes", "12 pack", 1.6, 3, 12),
      p("Chocolate Wafer Bars", "8 pack", 1.85, 3, 12, { vat: "S" }),
    ],
  },
  {
    path: "Snacks & Confectionery > Chocolate & Sweets",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Cocoa Lane",
    products: [
      p("Milk Chocolate Bar", "45g", 1.05, 14, 24),
      p("Caramel Chocolate Bar", "50g", 1.05, 9, 24),
      p("Milk Chocolate Sharing Bar", "180g", 2.5, 4, 12),
      p("Chocolate Buttons Sharing Bag", "119g", 1.75, 3, 12),
      p("Fruity Chews", "160g", 1.5, 4, 12, { brand: "Jellybrook" }),
      p("Sour Sweets", "160g", 1.5, 3, 12, { brand: "Jellybrook" }),
      p("Extra Strong Mints", "38g", 0.75, 4, 24, { brand: "Jellybrook" }),
      p("Spearmint Chewing Gum", "10 pieces", 0.8, 4, 24, {
        brand: "Jellybrook",
      }),
    ],
  },
  {
    path: "Drinks > Soft Drinks",
    supplier: "wholesale",
    margin: 0.28,
    vat: "S",
    brand: "Fizzwell",
    products: [
      p("Cola", "2L", 1.95, 10, 6),
      p("Diet Cola", "2L", 1.95, 7, 6),
      p("Cola", "330ml can", 0.85, 14, 24),
      p("Cola", "8 x 330ml", 4.5, 4, 3),
      p("Cola", "2L", 0.7, 4, 6, { brand: "Thrift & Co" }),
      p("Lemonade", "2L", 0.9, 4, 6),
      p("Orange Fizz", "330ml can", 0.8, 6, 24),
      p("Energy Drink", "250ml can", 1.2, 10, 24),
      p("Sugar Free Energy Drink", "250ml can", 1.2, 6, 24),
      p("Orange Squash", "1L", 1.4, 4, 12),
      p("Blackcurrant Squash", "1L", 1.6, 2, 12),
      p("Sports Drink", "500ml", 1.35, 3, 12),
    ],
  },
  {
    path: "Drinks > Water",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Glenbrae Springs",
    products: [
      p("Still Spring Water", "500ml", 0.6, 15, 24),
      p("Still Spring Water", "2L", 0.75, 6, 6),
      p("Still Spring Water", "6 x 500ml", 2.0, 3, 4),
      p("Sparkling Spring Water", "1L", 0.8, 3, 6),
    ],
  },
  {
    path: "Drinks > Juice",
    supplier: "wholesale",
    margin: 0.28,
    vat: "S",
    brand: "Sunny Grove",
    products: [
      p("Smooth Orange Juice", "1L", 1.65, 6, 6),
      p("Apple Juice", "1L", 1.1, 3, 12),
      p("Cranberry Juice Drink", "1L", 1.6, 1.5, 12),
      p("Apple Juice Cartons", "4 x 200ml", 1.2, 3, 6),
    ],
  },
  {
    path: "Beer, Wine & Spirits > Beer & Cider",
    supplier: "drinks",
    margin: 0.22,
    vat: "S",
    brand: "Harbour Gate Brewing",
    products: [
      p("Premium Lager", "4 x 440ml", 5.5, 6, 6),
      p("Premium Lager", "10 x 440ml", 11.5, 3, 2),
      p("Pale Ale", "500ml bottle", 2.1, 3, 8),
      p("Irish Style Stout", "4 x 440ml", 5.75, 2, 6),
      p("Alcohol Free Lager", "4 x 330ml", 4.0, 1, 6),
      p("Apple Cider", "4 x 500ml", 5.25, 3, 6, { brand: "Pippin Hill" }),
    ],
  },
  {
    path: "Beer, Wine & Spirits > Wine",
    supplier: "drinks",
    margin: 0.25,
    vat: "S",
    brand: "Castellan Hills",
    products: [
      p("Merlot Red Wine", "75cl", 6.99, 5, 6),
      p("Shiraz Red Wine", "75cl", 7.49, 3, 6),
      p("Sauvignon Blanc White Wine", "75cl", 7.49, 5, 6),
      p("Pinot Grigio White Wine", "75cl", 6.99, 5, 6),
      p("Rose Wine", "75cl", 6.99, 3, 6),
      p("Prosecco", "75cl", 8.99, 3, 6),
    ],
  },
  {
    path: "Beer, Wine & Spirits > Spirits",
    supplier: "drinks",
    margin: 0.2,
    vat: "S",
    brand: "Northern Still",
    products: [
      p("Vodka", "70cl", 16.0, 2, 6),
      p("Vodka", "35cl", 9.0, 1.5, 6),
      p("London Dry Gin", "70cl", 18.0, 2, 6),
      p("Blended Scotch Whisky", "70cl", 19.0, 1.5, 6),
      p("Spiced Rum", "70cl", 20.0, 0.3, 6),
    ],
  },
  {
    path: "Household > Cleaning & Kitchen",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Brightway",
    products: [
      p("Washing Up Liquid", "450ml", 1.2, 4, 12),
      p("Thick Bleach", "750ml", 0.8, 3, 12),
      p("Multi-Surface Cleaner Spray", "500ml", 1.5, 2, 8),
      p("Dishwasher Tablets", "30 pack", 5.5, 1.5, 6),
      p("Bin Bags", "20 pack", 2.25, 2, 12),
      p("Sponge Scourers", "4 pack", 0.95, 1.5, 12),
      p("Aluminium Foil", "10m", 1.75, 1.5, 12),
      p("Cling Film", "30m", 1.25, 1.5, 12),
      p("AA Batteries", "4 pack", 4.0, 0.5, 10),
    ],
  },
  {
    path: "Household > Laundry",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Brightway",
    products: [
      p("Biological Laundry Liquid", "38 washes", 6.0, 2, 4),
      p("Fabric Conditioner", "1.2L", 2.5, 1.5, 6),
    ],
  },
  {
    path: "Household > Paper & Tissues",
    supplier: "wholesale",
    margin: 0.3,
    vat: "S",
    brand: "Cloudsoft",
    products: [
      p("Toilet Tissue", "9 rolls", 4.75, 6, 5),
      p("Toilet Tissue", "4 rolls", 2.4, 4, 10),
      p("Kitchen Roll", "2 rolls", 2.25, 3, 12),
      p("Facial Tissues", "Box", 1.2, 1.5, 12),
    ],
  },
  {
    path: "Health & Beauty > Toiletries",
    supplier: "wholesale",
    margin: 0.35,
    vat: "S",
    brand: "Puremoor",
    products: [
      p("Fresh Mint Toothpaste", "75ml", 1.5, 3, 12, { brand: "Fresh Smile" }),
      p("Medium Toothbrush", "2 pack", 2.0, 1, 12, { brand: "Fresh Smile" }),
      p("Shampoo", "400ml", 2.75, 2, 6),
      p("Shower Gel", "250ml", 1.5, 3, 6),
      p("Antiperspirant Spray", "150ml", 2.5, 3, 6),
      p("Hand Wash", "250ml", 1.1, 2, 6),
      p("Disposable Razors", "5 pack", 2.5, 0.3, 12),
      // Sanitary products have been zero-rated since January 2021.
      p("Sanitary Towels Regular", "14 pack", 1.85, 1.5, 12, { vat: "Z" }),
    ],
  },
  {
    path: "Health & Beauty > Medicines",
    supplier: "wholesale",
    margin: 0.35,
    vat: "S",
    brand: "Relivia",
    products: [
      p("Paracetamol Tablets 500mg", "16 pack", 0.65, 4, 12),
      p("Ibuprofen Tablets 200mg", "16 pack", 0.85, 2, 12),
      p("Cold & Flu Capsules", "16 pack", 3.25, 1, 12),
      p("Assorted Plasters", "40 pack", 2.0, 0.3, 12),
      // Nicotine replacement products are reduced-rate (5%).
      p("Nicotine Gum 2mg", "105 pieces", 9.5, 0.2, 6, { vat: "R" }),
    ],
  },
  {
    path: "Baby > Baby Care",
    supplier: "wholesale",
    margin: 0.18,
    vat: "S",
    brand: "Littlebud",
    products: [
      p("Nappies Size 4", "30 pack", 5.5, 1.5, 4),
      p("Nappies Size 5", "26 pack", 5.5, 1, 4),
      p("Baby Wipes", "64 pack", 1.1, 3, 12),
    ],
  },
  {
    path: "Baby > Baby Food",
    supplier: "wholesale",
    margin: 0.18,
    vat: "Z",
    brand: "Littlebud",
    products: [
      p("Apple & Banana Fruit Pouch", "120g", 1.1, 2, 12),
      p("Baby Porridge", "200g", 2.25, 0.2, 6),
      p("First Infant Milk", "800g", 11.5, 0.5, 6),
    ],
  },
  {
    path: "Pet > Pet Food & Care",
    supplier: "wholesale",
    margin: 0.28,
    vat: "S",
    brand: "Whisker & Wag",
    products: [
      p("Cat Food Pouches in Gravy", "12 x 85g", 4.5, 3, 4),
      p("Dry Cat Food Chicken", "800g", 3.25, 1.5, 6),
      p("Dog Food Chunks in Jelly", "400g", 1.0, 4, 12),
      p("Adult Dry Dog Food", "2kg", 5.5, 0.8, 4),
      p("Cat Litter", "5L", 2.5, 1, 4),
      p("Gravy Dog Biscuits", "400g", 1.75, 1, 12),
    ],
  },
];

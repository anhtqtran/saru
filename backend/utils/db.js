const { MongoClient, ObjectId } = require('mongodb');
const { logger } = require('../middleware/logger');

let client;
let database;
const collections = {
  productCollection: null,
  imageCollection: null,
  categoryCollection: null,
  reviewCollection: null,
  orderDetailCollection: null,
  accountCollection: null,
  customerCollection: null,
  productstockCollection: null,
  blogCollection: null,
  blogCategoryCollection: null,
  faqCollection: null,
  membershipCollection: null,
  orderCollection: null,
  messageCollection: null,
};

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  client = new MongoClient(uri);
  try {
    await client.connect();
    database = client.db('SaruData');
    collections.productCollection = database.collection('products');
    collections.imageCollection = database.collection('images');
 collections.categoryCollection = database.collection('productcategories');
    collections.reviewCollection = database.collection('reviews');
    collections.orderDetailCollection = database.collection('orderdetails');
    collections.accountCollection = database.collection('accounts');
    collections.customerCollection = database.collection('customers');
    collections.productstockCollection = database.collection('productstocks');
    collections.blogCollection = database.collection('blogs');
    collections.blogCategoryCollection = database.collection('blogcategories');
    collections.faqCollection = database.collection('faqs');
    collections.membershipCollection = database.collection('memberships');
    collections.orderCollection = database.collection('orders');
    collections.messageCollection = database.collection('consultants');

    await collections.productCollection.createIndex({ ProductID: 1 }, { unique: true });
    await collections.accountCollection.createIndex({ CustomerEmail: 1 }, { unique: true });
    await collections.productCollection.createIndex({ CateID: 1 });
    await collections.reviewCollection.createIndex({ ProductID: 1, DatePosted: -1 });

    logger.info('Connected to MongoDB', { correlationId: 'system' });
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { error: error.message, correlationId: 'system' });
    process.exit(1);
  }
}

module.exports = { connectDB, client, database, collections, ObjectId };
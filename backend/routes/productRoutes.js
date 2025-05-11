const express = require('express');
const router = express.Router();
const { collections, ObjectId, database } = require('../utils/db');
const { logger } = require('../middleware/logger');

const bestSellingProductsPipeline = (productId) => [
  ...(productId ? [] : [{ $group: { _id: '$ProductID', totalQuantity: { $sum: '$Quantity' } } }]),
  ...(productId ? [{ $match: { _id: productId } }] : []),
  ...(productId ? [] : [{ $sort: { totalQuantity: -1 } }]),
  ...(productId ? [] : [{ $limit: 5 }]),
  {
    $lookup: {
      from: 'products',
      let: { pid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$ProductID', '$$pid'] } } },
        {
          $lookup: {
            from: 'images',
            let: { imageId: '$ImageID' },
            pipeline: [
              { $match: { $expr: { $eq: ['$ImageID', '$$imageId'] } } },
              { $project: { _id: 0, ProductImageCover: 1 } },
            ],
            as: 'image',
          },
        },
        { $unwind: { path: '$image', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'productcategories',
            let: { cateId: '$CateID' },
            pipeline: [
              { $match: { $expr: { $eq: ['$CateID', '$$cateId'] } } },
              { $project: { _id: 0, CateName: 1 } },
            ],
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'reviews',
            let: { productId: '$ProductID' },
            pipeline: [
              { $match: { $expr: { $eq: ['$ProductID', '$$productId'] } } },
              {
                $group: {
                  _id: null,
                  averageRating: { $avg: '$Rating' },
                  reviewCount: { $sum: 1 },
                },
              },
            ],
            as: 'reviews',
          },
        },
        { $unwind: { path: '$reviews', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            ProductID: 1,
            ProductName: 1,
            ProductPrice: 1,
            ProductImageCover: { $ifNull: ['$image.ProductImageCover', 'default-image-url'] },
            CateName: { $ifNull: ['$category.CateName', 'Không có danh mục'] },
            averageRating: { $ifNull: ['$reviews.averageRating', 0] },
            reviewCount: { $ifNull: ['$reviews.reviewCount', 0] },
            description: 1,
            relatedProducts: 1,
          },
        },
      ],
      as: 'product',
    },
  },
  { $match: { product: { $ne: [] } } },
  { $unwind: { path: '$product', preserveNullAndEmptyArrays: false } },
  {
    $project: {
      _id: '$product._id',
      productId: '$_id',
      productName: '$product.ProductName',
      productPrice: '$product.ProductPrice',
      productImageCover: '$product.ProductImageCover',
      categoryName: '$product.CateName',
      totalQuantity: { $ifNull: ['$totalQuantity', 0] },
      averageRating: '$product.averageRating',
      reviewCount: '$product.reviewCount',
      description: '$product.description',
      relatedProducts: '$product.relatedProducts',
    },
  },
];

router.get('/best-selling', async (req, res) => {
  try {
    console.log('Request received:', req.method, req.url, req.query);

    if (Object.keys(req.query).length > 0) {
      console.log('Query params not supported:', req.query);
      return res.status(400).json({ message: 'This endpoint does not accept query parameters' });
    }

    const bestSellingProducts = await collections.orderDetailCollection
      .aggregate(bestSellingProductsPipeline())
      .toArray();
    console.log('Aggregation result:', bestSellingProducts);

    if (!bestSellingProducts.length) {
      console.log('No best-selling products found');
      return res.status(200).json([]);
    }

    res.status(200).json(bestSellingProducts);
  } catch (err) {
    console.error('Aggregation error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/map-id/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    console.log('Request received for mapping ProductID to _id:', req.method, req.url, { productId });

    const product = await collections.productCollection.findOne(
      { ProductID: productId },
      { projection: { _id: 1 } }
    );

    if (!product) {
      console.log('Product not found for ProductID:', productId);
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    res.status(200).json({ _id: product._id.toHexString() });
  } catch (err) {
    console.error('Error mapping ProductID to _id:', err.stack);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

router.get('/best-seller-detail/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    console.log('Request received for best-seller-detail:', req.method, req.url, { productId });

    const pipeline = bestSellingProductsPipeline(productId);
    const result = await collections.orderDetailCollection.aggregate(pipeline).toArray();

    if (!result.length) {
      console.log('No best seller detail found for productId:', productId);
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    console.log('Best seller detail result:', result[0]);
    res.status(200).json(result[0]);
  } catch (err) {
    console.error('Aggregation error for best seller detail:', err.stack);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

router.get('/images/:imageId', async (req, res) => {
  try {
    const image = await collections.imageCollection.findOne({ ImageID: req.params.imageId });
    if (!image)
      return res.status(404).json({ error: `Image not found for ID: ${req.params.imageId}` });

    res.json({
      ImageID: image.ImageID,
      ProductImageCover: image.ProductImageCover || '',
      ProductImageSub1: image.ProductImageSub1 || '',
      ProductImageSub2: image.ProductImageSub2 || '',
      ProductImageSub3: image.ProductImageSub3 || '',
    });
  } catch (err) {
    logger.error('Error fetching image:', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  const keyword = req.query.q;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const suggestions = await collections.productCollection
      .find({
        ProductName: { $regex: keyword, $options: 'i' },
      })
      .limit(5)
      .project({ ProductName: 1, _id: 0 })
      .toArray();
    res.json(suggestions.map((s) => s.ProductName));
  } catch (err) {
    logger.error('Error in GET /api/products/search', {
      error: err.message,
      correlationId: req.correlationId,
    });
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await collections.categoryCollection.find().toArray();
    res.json(categories);
  } catch (err) {
    logger.error('Error in GET /api/categories', {
      error: err.message,
      correlationId: req.correlationId,
    });
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    console.log('📢 API `/api/products` đã được gọi!');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.brand) filter.ProductBrand = req.query.brand;
    if (req.query.category) filter.CateID = req.query.category;
    if (req.query.minPrice || req.query.maxPrice) {
      filter.ProductPrice = {};
      if (req.query.minPrice) filter.ProductPrice.$gte = parseInt(req.query.minPrice);
      if (req.query.maxPrice) filter.ProductPrice.$lte = parseInt(req.query.maxPrice);
    }
    if (req.query.wineVolume) filter.WineVolume = req.query.wineVolume;
    if (req.query.wineType) filter.WineType = req.query.wineType;
    if (req.query.wineIngredient) filter.WineIngredient = req.query.wineIngredient;
    if (req.query.wineFlavor) filter.WineFlavor = req.query.wineFlavor;
    if (req.query.bestSellers === 'true') filter.isBestSeller = true;
    if (req.query.onSale === 'true') filter.PromotionID = { $ne: null };

    const sortOptions = {
      priceAsc: { ProductPrice: 1 },
      priceDesc: { ProductPrice: -1 },
    };
    const sort = sortOptions[req.query.sort] || { ProductPrice: -1 };

    const [items, total] = await Promise.all([
      collections.productCollection.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      collections.productCollection.countDocuments(filter),
    ]);

    const productIDs = items.map((p) => p.ProductID);
    const promotionIDs = items.map((p) => p.PromotionID).filter((id) => id !== null);

    const productsWithImages = await database
      .collection('products')
      .aggregate([
        { $match: { ProductID: { $in: productIDs } } },
        {
          $lookup: {
            from: 'images',
            localField: 'ImageID',
            foreignField: 'ImageID',
            as: 'imageData',
          },
        },
        {
          $unwind: {
            path: '$imageData',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            ProductID: 1,
            ProductName: 1,
            ProductSKU: 1,
            CateID: 1,
            ProductBrand: 1,
            ImageID: 1,
            ProductPrice: 1,
            PromotionID: 1,
            ProductImageCover: { $ifNull: ['$imageData.ProductImageCover', ''] },
            ProductImageSub1: { $ifNull: ['$imageData.ProductImageSub1', ''] },
            ProductImageSub2: { $ifNull: ['$imageData.ProductImageSub2', ''] },
            ProductImageSub3: { $ifNull: ['$imageData.ProductImageSub3', ''] },
          },
        },
      ])
      .toArray();

    const productMap = productsWithImages.reduce((acc, p) => {
      acc[p.ProductID] = p;
      return acc;
    }, {});

    const stocks = await collections.productstockCollection
      .find({ ProductID: { $in: productIDs } })
      .toArray();
    const stockMap = stocks.reduce((acc, stock) => {
        acc[stock.ProductID] = stock.StockQuantity;
      return acc;
    }, {});

    const promotions = await database.collection('promotions').find({ PromotionID: { $in: promotionIDs } }).toArray();
    const promotionMap = promotions.reduce((acc, promo) => {
      acc[promo.PromotionID] = {
        startDate: new Date(promo.PromotionStartDate),
        expiredDate: new Date(promo.PromotionExpiredDate),
        value: promo.PromotionValue
      };
      return acc;
    }, {});

    const reviewsAgg = await collections.reviewCollection.aggregate([
      { $match: { ProductID: { $in: productIDs } } },
      {
        $group: {
          _id: "$ProductID",
          averageRating: { $avg: { $min: [{ $max: ["$Rating", 0] }, 5] } },
          totalReviewCount: { $sum: 1 }
        }
      }
    ]).toArray();
    const reviewMap = reviewsAgg.reduce((acc, r) => {
      acc[r._id] = {
        averageRating: Number(r.averageRating.toFixed(1)) || null,
        totalReviewCount: r.totalReviewCount || 0
      };
      return acc;
    }, {});

    const cateIDs = [...new Set(items.map(p => p.CateID))];
    const categories = await collections.categoryCollection.find({ CateID: { $in: cateIDs } }).toArray();
    const cateMap = categories.reduce((acc, cur) => {
      acc[cur.CateID] = cur.CateName;
      return acc;
    }, {});

    const currentDate = new Date('2025-03-11');

    const productsWithDetails = items.map(p => {
      const stockQuantity = stockMap[p.ProductID] || 0;
      const stockStatus = stockQuantity > 0 ? 'In Stock' : 'Out of Stock';

      let isOnSale = false;
      let currentPrice = p.ProductPrice || 0;
      let discountPercentage = 0;

      if (p.PromotionID !== null) {
        const promo = promotionMap[p.PromotionID];
        if (promo) {
          const startDate = promo.startDate;
          const expiredDate = promo.expiredDate;
          const promotionValue = promo.value;

          if (currentDate >= startDate && currentDate <= expiredDate) {
            const discountMultiplier = 1 - (promotionValue / 100);
            currentPrice = p.ProductPrice * discountMultiplier;
            isOnSale = true;
            discountPercentage = promotionValue;
          }
        }
      }

      const reviewData = reviewMap[p.ProductID] || { averageRating: null, totalReviewCount: 0 };
      const productWithImage = productMap[p.ProductID] || {};

      return {
        ...p,
        CateName: cateMap[p.CateID] || 'Unknown',
        currentPrice: currentPrice,
        originalPrice: p.ProductPrice || 0,
        stockStatus: stockStatus,
        isOnSale: isOnSale,
        discountPercentage: discountPercentage,
        averageRating: reviewData.averageRating,
        totalReviewCount: reviewData.totalReviewCount,
        ProductImageCover: productWithImage.ProductImageCover || '',
        ProductImageSub1: productWithImage.ProductImageSub1 || '',
        ProductImageSub2: productWithImage.ProductImageSub2 || '',
        ProductImageSub3: productWithImage.ProductImageSub3 || ''
      };
    });

    if (!productsWithDetails.length) {
      console.log('⚠️ Không tìm thấy dữ liệu');
    }

    console.log("📢 Dữ liệu trả về:", JSON.stringify(productsWithDetails, null, 2));

    res.json({
      data: productsWithDetails,
      pagination: { currentPage: page, totalPages: Math.ceil(total / limit), totalItems: total }
    });
  } catch (err) {
    console.error('❌ Lỗi chi tiết:', err.stack);
    logger.error('Error in GET /products', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/filters', async (req, res) => {
  try {
    const categories = await collections.categoryCollection.find().toArray();
    const brands = await collections.productCollection.distinct('ProductBrand');
    const wineVolumes = await collections.productCollection.distinct('WineVolume');
    const wineTypes = await collections.productCollection.distinct('WineType');
    res.json({ categories, brands, wineVolumes, wineTypes });
  } catch (err) {
    logger.error('Error in GET /filters', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const bestSellers = await collections.productCollection.find({ isBestSeller: true }).limit(5).toArray();
    const promotions = await collections.productCollection.find({ isPromotion: true }).limit(5).toArray();
    res.json({ bestSellers, promotions });
  } catch (err) {
    logger.error('Error in GET /recommendations', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/full-details', async (req, res) => {
  try {
    const productsWithDetails = await database.collection('products').aggregate([
      {
        $lookup: {
          from: "productstocks",
          localField: "ProductID",
          foreignField: "ProductID",
          as: "stockData"
        }
      },
      {
        $unwind: {
          path: "$stockData",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "images",
          localField: "ImageID",
          foreignField: "ImageID",
          as: "imageData"
        }
      },
      {
        $unwind: {
          path: "$imageData",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "productcategories",
          localField: "CateID",
          foreignField: "CateID",
          as: "categoryData"
        }
      },
      {
        $unwind: {
          path: "$categoryData",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          ProductID: 1,
          ProductName: 1,
          ProductPrice: 1,
          ProductBrand: 1,
          StockQuantity: { $ifNull: ["$stockData.StockQuantity", 0] },
          ProductImageCover: { $ifNull: ["$imageData.ProductImageCover", ""] },
          ProductImageSub1: { $ifNull: ["$imageData.ProductImageSub1", ""] },
          ProductImageSub2: { $ifNull: ["$imageData.ProductImageSub2", ""] },
          ProductImageSub3: { $ifNull: ["$imageData.ProductImageSub3", ""] },
          CateID: 1,
          CateName: { $ifNull: ["$categoryData.CateName", "Chưa phân loại"] }
        }
      }
    ]).toArray();

    res.json({ data: productsWithDetails });
  } catch (err) {
    console.error('Lỗi trong API /products-full-details:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      logger.warn('Invalid ObjectId provided', { id: req.params.id, correlationId: req.correlationId });
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' });
    }

    const productId = new ObjectId(req.params.id);
    const product = await collections.productCollection.findOne({ _id: productId });
    if (!product) {
      logger.info('Product not found', { id: req.params.id, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    }

    const stock = await collections.productstockCollection.findOne({ ProductID: product.ProductID });
    const stockQuantity = stock ? stock.StockQuantity : 0;
    const stockStatus = stockQuantity > 0 ? 'In Stock' : 'Out of Stock';

    let isOnSale = false;
    let currentPrice = product.ProductPrice || 0;
    let discountPercentage = 0;
    const currentDate = new Date('2025-03-11');

    if (product.PromotionID) {
      const promo = await database.collection('promotions').findOne({ PromotionID: product.PromotionID });
      if (promo) {
        const startDate = new Date(promo.PromotionStartDate);
        const expiredDate = new Date(promo.PromotionExpiredDate);
        const promotionValue = promo.PromotionValue;

        if (currentDate >= startDate && currentDate <= expiredDate) {
          const discountMultiplier = 1 - (promotionValue / 100);
          currentPrice = product.ProductPrice * discountMultiplier;
          isOnSale = true;
          discountPercentage = promotionValue;
        }
      }
    }

    const image = await collections.imageCollection.findOne({ ImageID: product.ImageID }) || {};
    const productWithImages = {
      ...product,
      ProductImageCover: image.ProductImageCover || '',
      ProductImageSub1: image.ProductImageSub1 || '',
      ProductImageSub2: image.ProductImageSub2 || '',
      ProductImageSub3: image.ProductImageSub3 || '',
      currentPrice: currentPrice,
      originalPrice: product.ProductPrice || 0,
      stockStatus: stockStatus,
      isOnSale: isOnSale,
      discountPercentage: discountPercentage
    };

    const reviewsAgg = await collections.reviewCollection.aggregate([
      { $match: { ProductID: product.ProductID } },
      { $sort: { DatePosted: -1 } },
      {
        $project: {
          _id: 0,
          CustomerID: 1,
          Rating: { $min: [{ $max: ["$Rating", 0] }, 5] },
          Content: 1,
          DatePosted: {
            $cond: {
              if: { $eq: [{ $type: "$DatePosted" }, "string"] },
              then: {
                $let: {
                  vars: { convertedDate: { $toDate: "$DatePosted" } },
                  in: {
                    $cond: {
                      if: { $eq: [{ $type: "$$convertedDate" }, "date"] },
                      then: { $dateToString: { format: "%d/%m/%Y", date: "$$convertedDate" } },
                      else: "N/A"
                    }
                  }
                }
              },
              else: { $dateToString: { format: "%d/%m/%Y", date: "$DatePosted" } }
            }
          }
        }
      }
    ]).toArray();

    const validReviews = reviewsAgg.filter(r => r.Rating > 0);
    const averageRating = validReviews.length > 0
      ? Number((validReviews.reduce((sum, r) => sum + r.Rating, 0) / validReviews.length).toFixed(1))
      : 0;

    const relatedProducts = await collections.productCollection.aggregate([
      {
        $match: {
          CateID: product.CateID,
          _id: { $ne: new ObjectId(productId) }
        }
      },
      { $limit: 4 },
      {
        $lookup: {
          from: "images",
          let: { imageId: "$ImageID" },
          pipeline: [
            { $match: { $expr: { $eq: ["$ImageID", "$$imageId"] } } },
            { $project: { _id: 0, ProductImageCover: 1, ProductImageSub1: 1, ProductImageSub2: 1, ProductImageSub3: 1 } }
          ],
          as: "image"
        }
      },
      { $unwind: { path: "$image", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          ProductName: 1,
          ProductPrice: 1,
          ProductImageCover: { $ifNull: ["$image.ProductImageCover", ""] },
          ProductImageSub1: { $ifNull: ["$image.ProductImageSub1", ""] },
          ProductImageSub2: { $ifNull: ["$image.ProductImageSub2", ""] },
          ProductImageSub3: { $ifNull: ["$image.ProductImageSub3", ""] }
        }
      }
    ]).toArray();

    const relatedProductsWithStringId = relatedProducts.map(p => ({
      ...p,
      _id: p._id.toHexString()
    }));

    res.json({
      ...productWithImages,
      reviews: reviewsAgg,
      averageRating,
      totalReviewCount: validReviews.length,
      relatedProducts: relatedProductsWithStringId
    });
  } catch (err) {
    logger.error('Error fetching product detail', {
      error: err.message,
      stack: err.stack,
      id: req.params.id,
      correlationId: req.correlationId
    });
    res.status(500).json({ message: 'Lỗi hệ thống, vui lòng thử lại sau.', error: err.message });
  }
});

module.exports = router;
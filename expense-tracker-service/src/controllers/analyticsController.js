const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
const {
  getAllSubclasses,
  formatSubclassLabel,
} = require("../constants/transactionSubclasses");

// Helper function to build date range filter
const buildDateRangeFilter = (startDate, endDate) => {
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  return dateFilter;
};

// A. Get Category Analytics - expenses/income grouped by subclass (category)
const getCategoryAnalytics = async (req, res) => {
  try {
    const { userId, type, startDate, endDate } = req.query;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    // Build match stage
    const matchStage = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // Add type filter (income/expense)
    if (type && ["income", "expense"].includes(type)) {
      matchStage.type = type;
    }

    // Add date range filter
    Object.assign(matchStage, buildDateRangeFilter(startDate, endDate));

    // MongoDB aggregation pipeline
    const categoryData = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$subclass",
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
          maxAmount: { $max: "$amount" },
          minAmount: { $min: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Calculate total for percentage calculation
    const grandTotal = categoryData.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );
    const totalTransactions = categoryData.reduce(
      (sum, item) => sum + item.transactionCount,
      0
    );

    // Format data for charts
    const categories = categoryData.map((item) => ({
      name: formatSubclassLabel(item._id),
      subclass: item._id,
      value: Math.round(item.totalAmount * 100) / 100,
      count: item.transactionCount,
      avgAmount: Math.round(item.avgAmount * 100) / 100,
      maxAmount: Math.round(item.maxAmount * 100) / 100,
      minAmount: Math.round(item.minAmount * 100) / 100,
      percentage:
        grandTotal > 0
          ? Math.round((item.totalAmount / grandTotal) * 100 * 100) / 100
          : 0,
    }));

    res.status(200).json({
      success: true,
      message: "Category analytics retrieved successfully",
      data: {
        categories,
        summary: {
          totalAmount: Math.round(grandTotal * 100) / 100,
          totalTransactions,
          type: type || "all",
          dateRange: { startDate, endDate },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching category analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// B. Get Timeline Analytics - expenses/income over time periods
const getTimelineAnalytics = async (req, res) => {
  try {
    const { userId, period = "monthly", startDate, endDate, type } = req.query;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    // Validate period
    const validPeriods = ["daily", "weekly", "monthly", "yearly"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Allowed values: " + validPeriods.join(", "),
      });
    }

    // Build match stage
    const matchStage = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // Add type filter if specified
    if (type && ["income", "expense"].includes(type)) {
      matchStage.type = type;
    }

    // Add date range filter
    Object.assign(matchStage, buildDateRangeFilter(startDate, endDate));

    // Define grouping format based on period
    let groupByFormat;
    switch (period) {
      case "daily":
        groupByFormat = {
          $dateToString: { format: "%Y-%m-%d", date: "$date" },
        };
        break;
      case "weekly":
        groupByFormat = { $dateToString: { format: "%Y-W%U", date: "$date" } };
        break;
      case "monthly":
        groupByFormat = { $dateToString: { format: "%Y-%m", date: "$date" } };
        break;
      case "yearly":
        groupByFormat = { $dateToString: { format: "%Y", date: "$date" } };
        break;
      default:
        groupByFormat = { $dateToString: { format: "%Y-%m", date: "$date" } };
    }

    // MongoDB aggregation pipeline
    const timelineData = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            period: groupByFormat,
            type: "$type",
          },
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.period": 1, "_id.type": 1 } },
    ]);

    // Organize data by period
    const timelineMap = {};
    timelineData.forEach((item) => {
      const period = item._id.period;
      const type = item._id.type;

      if (!timelineMap[period]) {
        timelineMap[period] = {
          period,
          income: 0,
          expense: 0,
          net: 0,
          incomeCount: 0,
          expenseCount: 0,
        };
      }

      timelineMap[period][type] = Math.round(item.totalAmount * 100) / 100;
      timelineMap[period][`${type}Count`] = item.transactionCount;
    });

    // Calculate net balance and format timeline
    const timeline = Object.values(timelineMap).map((item) => ({
      ...item,
      net: Math.round((item.income - item.expense) * 100) / 100,
      totalTransactions: item.incomeCount + item.expenseCount,
    }));

    // Calculate summary
    const summary = timeline.reduce(
      (acc, item) => ({
        totalIncome: acc.totalIncome + item.income,
        totalExpense: acc.totalExpense + item.expense,
        netBalance: acc.netBalance + item.net,
        totalTransactions: acc.totalTransactions + item.totalTransactions,
      }),
      { totalIncome: 0, totalExpense: 0, netBalance: 0, totalTransactions: 0 }
    );

    res.status(200).json({
      success: true,
      message: "Timeline analytics retrieved successfully",
      data: {
        timeline,
        summary: {
          ...summary,
          totalIncome: Math.round(summary.totalIncome * 100) / 100,
          totalExpense: Math.round(summary.totalExpense * 100) / 100,
          netBalance: Math.round(summary.netBalance * 100) / 100,
          period,
          dateRange: { startDate, endDate },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching timeline analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// C. Get Balance Overview - overall financial summary
const getBalanceOverview = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    // Build match stage
    const matchStage = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // Add date range filter
    Object.assign(matchStage, buildDateRangeFilter(startDate, endDate));

    // Get overall summary
    const [overallSummary, monthlyTrends] = await Promise.all([
      // Overall balance summary
      Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            transactionCount: { $sum: 1 },
            avgAmount: { $avg: "$amount" },
          },
        },
      ]),

      // Monthly trends for the overview
      Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: "%Y-%m", date: "$date" } },
              type: "$type",
            },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]),
    ]);

    const balanceData = {
      income: 0,
      expense: 0,
      incomeCount: 0,
      expenseCount: 0,
      incomeAvg: 0,
      expenseAvg: 0,
    };

    overallSummary.forEach((item) => {
      const type = item._id;
      balanceData[type] = Math.round(item.totalAmount * 100) / 100;
      balanceData[`${type}Count`] = item.transactionCount;
      balanceData[`${type}Avg`] = Math.round(item.avgAmount * 100) / 100;
    });

    const netBalance =
      Math.round((balanceData.income - balanceData.expense) * 100) / 100;
    const totalTransactions =
      balanceData.incomeCount + balanceData.expenseCount;

    const trendsMap = {};
    monthlyTrends.forEach((item) => {
      const month = item._id.month;
      const type = item._id.type;

      if (!trendsMap[month]) {
        trendsMap[month] = { month, income: 0, expense: 0 };
      }

      trendsMap[month][type] = Math.round(item.totalAmount * 100) / 100;
    });

    const trends = Object.values(trendsMap).map((item) => ({
      ...item,
      net: Math.round((item.income - item.expense) * 100) / 100,
    }));

    const savingsRate =
      balanceData.income > 0
        ? Math.round((netBalance / balanceData.income) * 100 * 100) / 100
        : 0;
    const expenseRatio =
      balanceData.income > 0
        ? Math.round((balanceData.expense / balanceData.income) * 100 * 100) /
          100
        : 0;

    res.status(200).json({
      success: true,
      message: "Balance overview retrieved successfully",
      data: {
        balance: {
          totalIncome: balanceData.income,
          totalExpense: balanceData.expense,
          netBalance,
          incomeTransactions: balanceData.incomeCount,
          expenseTransactions: balanceData.expenseCount,
          totalTransactions,
          avgIncome: balanceData.incomeAvg,
          avgExpense: balanceData.expenseAvg,
        },
        healthIndicators: {
          savingsRate,
          expenseRatio,
          status:
            netBalance > 0
              ? "positive"
              : netBalance < 0
              ? "negative"
              : "neutral",
        },
        trends,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    console.error("Error fetching balance overview:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get subclass options (reusing from transaction controller)
const getSubclassOptions = async (req, res) => {
  try {
    const subclasses = getAllSubclasses();

    res.status(200).json({
      success: true,
      message: "Subclass options retrieved successfully",
      data: subclasses,
    });
  } catch (error) {
    console.error("Error fetching subclass options:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getCategoryAnalytics,
  getTimelineAnalytics,
  getBalanceOverview,
  getSubclassOptions,
};

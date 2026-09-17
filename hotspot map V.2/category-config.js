(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.HOTMAP_CATEGORY_CONFIG = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createCategoryConfig() {
  return {
    hunian: {
      label: "hunian",
      exportLabel: "hunian",
      keywords: ["housing complex", "perumahan", "cluster", "apartment", "housing"],
    },
    kids_education: {
      label: "kids_education",
      exportLabel: "kids_education",
      keywords: ["kids education", "bimba", "preschool", "day care", "TK", "Kelompok bermain", "paud"],
    },
    affiliate: {
      label: "affiliate",
      exportLabel: "affiliate",
      keywords: ["taman", "rumah sakit", "mcdonalds", "mcdonald's", "KFC", "burger king", "playground"],
    },
    others: {
      label: "lainnya",
      exportLabel: "lainnya",
      keywords: [],
    },
  };
});

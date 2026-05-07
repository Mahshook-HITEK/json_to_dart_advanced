// Returns the contents of `convert_service.dart` to bundle alongside generated models.
// Defensive type-conversion helpers covering the most common JSON parsing needs.
export function convertServiceDart() {
  return `import 'dart:convert';

/// Defensive type-conversion helpers for parsing JSON fields whose
/// runtime types are unreliable (server returns strings for ints,
/// "null" strings, missing keys, etc.).
///
/// All helpers swallow exceptions and return a sensible default —
/// they NEVER throw. This keeps fromJson code free of try/catch noise.
class ConvertService {
  // ---------- scalars ----------

  static String convertString(dynamic data) {
    try {
      if (data != null) return data.toString();
    } catch (_) {}
    return "";
  }

  static String? convertStringNullable(dynamic data) {
    try {
      if (data == null) return null;
      final s = data.toString();
      if (s.isEmpty || s == "null") return null;
      return s;
    } catch (_) {}
    return null;
  }

  static int convertInt(dynamic data) {
    try {
      if (data == null || data == "null") return 0;
      if (data == "") return 0;
      if (data is int) return data;
      if (data is double) return data.toInt();
      return double.parse(data.toString()).toInt();
    } catch (_) {
      return 0;
    }
  }

  static int? convertIntNullable(dynamic data) {
    try {
      if (data == null || data == "null" || data == "") return null;
      if (data is int) return data;
      if (data is double) return data.toInt();
      return double.parse(data.toString()).toInt();
    } catch (_) {}
    return null;
  }

  static num convertNum(dynamic data) {
    try {
      if (data == null) return 0;
      if (data is num) return data;
      return num.parse(data.toString());
    } catch (_) {}
    return 0;
  }

  static double convertDouble(dynamic data) {
    try {
      final s = data?.toString().trim() ?? '';
      if (s.isEmpty) return 0;
      return double.tryParse(s) ?? 0;
    } catch (_) {}
    return 0;
  }

  static double? convertDoubleNullable(dynamic data) {
    try {
      final s = data?.toString().trim() ?? '';
      if (s.isEmpty) return null;
      return double.tryParse(s);
    } catch (_) {}
    return null;
  }

  static double convertDoubleRound(dynamic data, {int fractionDigits = 2}) {
    try {
      final n = double.parse(data.toString());
      return double.parse(n.toStringAsFixed(fractionDigits));
    } catch (_) {}
    return 0;
  }

  static bool convertBool(dynamic data) {
    try {
      if (data is bool) return data;
      final s = data.toString().toLowerCase();
      return s == "true" || s == "1" || s == "yes";
    } catch (_) {}
    return false;
  }

  static bool convertBoolInt(dynamic data) {
    try {
      if (data.toString() == "1") return true;
    } catch (_) {}
    return false;
  }

  static DateTime? convertDateTime(dynamic data) {
    try {
      if (data == null) return null;
      if (data is DateTime) return data;
      final s = data.toString();
      if (s.isEmpty) return null;
      return DateTime.tryParse(s);
    } catch (_) {}
    return null;
  }

  static Map<String, dynamic> convertMap(dynamic data) {
    try {
      if (data is Map<String, dynamic>) return data;
      if (data is Map) return Map<String, dynamic>.from(data);
      if (data is String && data.isNotEmpty) {
        final decoded = jsonDecode(data);
        if (decoded is Map<String, dynamic>) return decoded;
      }
    } catch (_) {}
    return <String, dynamic>{};
  }

  // ---------- list helpers ----------

  static List<String> parseStringList(dynamic productJson) {
    try {
      var list = productJson as List;
      return list.map((data) => convertString(data)).toList();
    } catch (_) {}
    return [];
  }

  static List<int> parseIntList(dynamic productJson) {
    try {
      if (productJson is String) productJson = jsonDecode(productJson);
      if (productJson is List) {
        return productJson.map((e) => convertInt(e)).toList();
      }
    } catch (_) {}
    return [];
  }

  static List<double> parseDoubleList(dynamic productJson) {
    try {
      var list = productJson as List;
      return list.map((data) => convertDouble(data)).toList();
    } catch (_) {}
    return [];
  }

  static List<num> parseNumList(dynamic productJson) {
    try {
      var list = productJson as List;
      return list.map((data) => convertNum(data)).toList();
    } catch (_) {}
    return [];
  }

  static List<bool> parseBoolList(dynamic productJson) {
    try {
      var list = productJson as List;
      return list.map((data) => convertBool(data)).toList();
    } catch (_) {}
    return [];
  }

  /// Generic mapper for List<T> when each element is itself a JSON object.
  /// Usage:
  ///   final items = ConvertService.parseList<MenuModel>(json['menu'], MenuModel.fromJson);
  static List<T> parseList<T>(dynamic productJson, T Function(Map<String, dynamic>) fromJson) {
    try {
      if (productJson is List) {
        return productJson
            .whereType<Map<String, dynamic>>()
            .map((e) => fromJson(e))
            .toList();
      }
    } catch (_) {}
    return [];
  }
}
`;
}

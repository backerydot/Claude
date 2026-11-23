package com.deutschtrainer.limit;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;

import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Правила ліміту: сесії, білий список, облік часу.
 *
 * День ділиться на сесії. У кожній — свій запас хвилин, невикористане не переходить далі:
 *   05:00–10:00 — 30 хв, 10:00–15:00 — 30 хв, 15:00–24:00 — 120 хв, 00:00–05:00 — 0.
 * Режим брата — окремі 60 хв на день, не чіпають запас власника.
 *
 * Екстра-час: кожен вперше зданий урок (німецька, хімія) дає +5 хв у запас.
 * Запас не згорає і вмикається сам, коли скінчився час поточної сесії (крім ночі 0–5).
 */
final class Limits {
    /** {початок, кінець (год), хвилин}. Години 0–5 не входять у жодну сесію — тоді запас 0. */
    static final int[][] SESSIONS = {{5, 10, 30}, {10, 15, 30}, {15, 24, 120}};
    static final int BROTHER_MIN = 60;
    static final int BONUS_MIN = 5;

    /** Завжди відкриті (не рахуються і не блокуються). */
    static final String[] ALLOWED = {
            // Месенджери, які просив власник
            "org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram",
            "com.viber.voip",
            // Браузери — без ліміту (TikTok і YouTube у них закриває охоронець Deutsch-Trainer)
            "com.android.chrome", "com.chrome.beta", "com.mi.globalbrowser", "com.android.browser",
            "com.sec.android.app.sbrowser", "org.mozilla.firefox", "com.microsoft.emmx",
            "com.opera.browser", "com.opera.mini.native", "com.brave.browser", "com.yandex.browser",
            "com.duckduckgo.mobile.android",
            // Тренер німецької (і хімії — він же), сам Ліміт
            "com.deutschtrainer.app", "com.deutschtrainer.limit",
            // Дзвінки, SMS, контакти — потрібні завжди, зокрема в екстреному разі
            "com.android.phone", "com.android.server.telecom", "com.android.incallui",
            "com.google.android.dialer", "com.android.dialer", "com.android.contacts",
            "com.google.android.contacts", "com.android.mms", "com.google.android.apps.messaging",
            // Будильник, налаштування, дозволи й встановлення застосунків
            "com.android.deskclock", "com.google.android.deskclock",
            "com.android.settings", "com.miui.securitycenter", "com.lbe.security.miui",
            "com.android.permissioncontroller", "com.google.android.permissioncontroller",
            "com.android.packageinstaller", "com.google.android.packageinstaller", "com.miui.packageinstaller",
            "com.android.emergency", "com.google.android.apps.safetyhub",
    };

    /** Системні вікна поверх застосунків: шторка, клавіатура, діалоги Google.
     *  Вони не змінюють «поточний застосунок» — інакше шторка над TikTok зупиняла б облік. */
    static final String[] IGNORED = {
            "com.android.systemui", "android", "com.google.android.gms", "com.miui.notification",
    };

    private Limits() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("limit", Context.MODE_PRIVATE);
    }

    // ---------- Сесії ----------

    /** Номер сесії зараз або -1 (ніч, 0:00–5:00). */
    static int sessionIndex(Calendar now) {
        int h = now.get(Calendar.HOUR_OF_DAY);
        for (int i = 0; i < SESSIONS.length; i++) {
            if (h >= SESSIONS[i][0] && h < SESSIONS[i][1]) return i;
        }
        return -1;
    }

    static String dayKey(Calendar now) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
                now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
    }

    static String usedKey(Calendar now, int session) {
        return "used/" + dayKey(now) + "/" + session;
    }

    /** Скільки секунд використано в сесії i сьогодні. */
    static long usedSec(Context c, Calendar now, int i) {
        return prefs(c).getLong(usedKey(now, i), 0);
    }

    /** Скільки секунд лишилося в поточній сесії (0 уночі). */
    static long leftSec(Context c, Calendar now) {
        int i = sessionIndex(now);
        if (i < 0) return 0;
        return Math.max(0, SESSIONS[i][2] * 60L - usedSec(c, now, i));
    }

    /** Наступна сесія після поточного моменту: {індекс, чи завтра (0/1)}. */
    static int[] nextSession(Calendar now) {
        int h = now.get(Calendar.HOUR_OF_DAY);
        for (int i = 0; i < SESSIONS.length; i++) {
            if (SESSIONS[i][0] > h) return new int[]{i, 0};
        }
        return new int[]{0, 1};
    }

    static String hhmm(int hour) {
        return String.format(Locale.ROOT, "%02d:00", hour % 24);
    }

    // ---------- Режим брата ----------

    static boolean brotherOn(Context c) {
        return prefs(c).getBoolean("brother/on", false);
    }

    static long brotherLeftSec(Context c, Calendar now) {
        return Math.max(0, BROTHER_MIN * 60L - prefs(c).getLong("brother/" + dayKey(now), 0));
    }

    static void setBrother(Context c, boolean on) {
        prefs(c).edit().putBoolean("brother/on", on).apply();
    }

    // ---------- Екстра-час за уроки ----------

    /** Скільки секунд екстра-часу в запасі. */
    static long bankSec(Context c) {
        return Math.max(0, prefs(c).getLong("bonus/bank", 0));
    }

    /** Чи можна зараз брати з запасу (уночі — ні). */
    static boolean bankUsable(Calendar now) {
        return sessionIndex(now) >= 0;
    }

    /**
     * Урок здано вперше — +5 хв у запас. id із префіксом предмета: «de:a1-03», «chem:r01».
     * Повертає true, якщо хвилини додано (за той самий урок двічі не дається).
     */
    static synchronized boolean grantBonus(Context c, String id) {
        SharedPreferences p = prefs(c);
        Set<String> ids = new HashSet<>(p.getStringSet("bonus/ids", new HashSet<>()));
        if (id == null || id.isEmpty() || ids.contains(id)) return false;
        ids.add(id);
        String todayKey = "bonus/today/" + dayKey(Calendar.getInstance());
        p.edit()
                .putStringSet("bonus/ids", ids)
                .putLong("bonus/bank", bankSec(c) + BONUS_MIN * 60L)
                .putInt(todayKey, p.getInt(todayKey, 0) + 1)
                .apply();
        return true;
    }

    /** Скільки уроків з бонусом здано сьогодні. */
    static int bonusToday(Context c, Calendar now) {
        return prefs(c).getInt("bonus/today/" + dayKey(now), 0);
    }

    // ---------- Облік ----------

    /**
     * Додати використаний час: у режимі брата — братові, інакше — у поточну сесію,
     * а коли сесія вичерпана — з екстра-запасу.
     */
    static synchronized void addUsage(Context c, Calendar now, long sec) {
        SharedPreferences p = prefs(c);
        if (brotherOn(c)) {
            String k = "brother/" + dayKey(now);
            p.edit().putLong(k, p.getLong(k, 0) + sec).apply();
            if (brotherLeftSec(c, now) <= 0) setBrother(c, false); // година брата скінчилась
            return;
        }
        int i = sessionIndex(now);
        if (i < 0) return;
        long toSession = Math.min(sec, leftSec(c, now));
        long toBank = sec - toSession;
        SharedPreferences.Editor e = p.edit();
        if (toSession > 0) {
            String k = usedKey(now, i);
            e.putLong(k, p.getLong(k, 0) + toSession);
        }
        if (toBank > 0) e.putLong("bonus/bank", Math.max(0, bankSec(c) - toBank));
        e.apply();
    }

    /** Чи йде зараз екстра-час (основний вичерпано, а запас є). */
    static boolean onBank(Context c, Calendar now) {
        return !brotherOn(c) && bankUsable(now) && leftSec(c, now) <= 0 && bankSec(c) > 0;
    }

    /** Усього лишилось зараз: сесія + запас (уночі запас не діє). */
    static long totalLeftSec(Context c, Calendar now) {
        if (brotherOn(c)) return brotherLeftSec(c, now);
        return leftSec(c, now) + (bankUsable(now) ? bankSec(c) : 0);
    }

    /** Чи є зараз час для застосунків поза білим списком. */
    static boolean hasTime(Context c, Calendar now) {
        return totalLeftSec(c, now) > 0;
    }

    // ---------- Білий список ----------

    private static Set<String> allowedCache;
    private static Set<String> ignoredCache;

    static synchronized boolean isAllowed(Context c, String pkg) {
        if (allowedCache == null) {
            Set<String> s = new HashSet<>();
            for (String a : ALLOWED) s.add(a);
            // Головний екран (лаунчер) — будь-який, що стоїть на телефоні (на Xiaomi це com.miui.home)
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            List<ResolveInfo> list = c.getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo r : list) s.add(r.activityInfo.packageName);
            allowedCache = s;
        }
        return allowedCache.contains(pkg);
    }

    static synchronized boolean isIgnored(Context c, String pkg) {
        if (ignoredCache == null) {
            Set<String> s = new HashSet<>();
            for (String a : IGNORED) s.add(a);
            InputMethodManager imm = (InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) for (InputMethodInfo m : imm.getInputMethodList()) s.add(m.getPackageName());
            ignoredCache = s;
        }
        return ignoredCache.contains(pkg);
    }

    /** «1 год 25 хв», «12 хв», «менше хвилини». */
    static String fmt(long sec) {
        if (sec <= 0) return "0 хв";
        if (sec < 60) return "менше хвилини";
        long m = (sec + 59) / 60; // округлюємо вгору: 29 хв 30 с — це ще «30 хв»
        if (m < 60) return m + " хв";
        return (m / 60) + " год" + (m % 60 > 0 ? " " + (m % 60) + " хв" : "");
    }
}

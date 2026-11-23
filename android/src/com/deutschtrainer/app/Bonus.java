package com.deutschtrainer.app;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;

/**
 * Зв'язок із застосунком «Ліміт» (com.deutschtrainer.limit): за вперше зданий урок
 * він додає +5 хв екстра-часу. Якщо «Ліміту» на телефоні немає — тихо нічого не робимо.
 */
final class Bonus {
    private static final Uri LIMIT = Uri.parse("content://com.deutschtrainer.limit.bonus");

    private Bonus() {}

    /** Текст для сайту, напр. «+5 хв екстра-часу в «Ліміті». У запасі: 15 хв.», або null. */
    static String grant(Context c, String id) {
        try {
            Bundle b = c.getContentResolver().call(LIMIT, "grant", id, null);
            if (b == null || !b.getBoolean("granted")) return null;
            long min = (b.getLong("bankSec") + 59) / 60;
            return "+" + b.getInt("minutes", 5) + " хв екстра-часу в «Ліміті». У запасі тепер " + fmt(min) + ".";
        } catch (Exception e) {
            return null; // «Ліміт» не встановлено або старої версії
        }
    }

    private static String fmt(long m) {
        if (m < 60) return m + " хв";
        return (m / 60) + " год" + (m % 60 > 0 ? " " + (m % 60) + " хв" : "");
    }
}

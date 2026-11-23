package com.deutschtrainer.limit;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.view.accessibility.AccessibilityManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Calendar;
import java.util.List;

/**
 * Екран Ліміту: скільки лишилось у поточній сесії, усі сесії дня, режим брата.
 * Сюди ж охоронець відкриває, коли час вийшов.
 */
public class MainActivity extends Activity {
    static final String EXTRA_KICKED = "kicked";

    private boolean dark;
    private boolean kicked;
    private LinearLayout box;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            render();
            handler.postDelayed(this, 5_000);
        }
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        getWindow().setStatusBarColor(paper());
        getWindow().setNavigationBarColor(paper());
        if (!dark) getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(paper());
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(24), dp(20), dp(32));
        scroll.addView(box);
        setContentView(scroll);
        kicked = getIntent().getBooleanExtra(EXTRA_KICKED, false);
        // Android 13+: без дозволу сповіщення «Лишилось N хв» не видно
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        kicked = intent.getBooleanExtra(EXTRA_KICKED, false);
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(tick);
        kicked = false; // повідомлення «час вийшов» показуємо лише одразу після закриття
        super.onPause();
    }

    // ---------- Кольори як у Deutsch-Trainer: папір, чорнило, жовтий маркер ----------

    private int paper() { return dark ? 0xFF111830 : 0xFFFBFCFA; }
    private int card() { return dark ? 0xFF1A2340 : 0xFFFFFFFF; }
    private int ink() { return dark ? 0xFFE8EDF8 : 0xFF1A2340; }
    private int ink2() { return dark ? 0xFFA9B3CC : 0xFF4F5978; }
    private int rule() { return dark ? 0xFF2C3758 : 0xFFDBE5F3; }
    private static final int MARKER = 0xFFFFE04A;
    private static final int MARKER_INK = 0xFF1A2340;
    private static final int RED = 0xFFC8372D;

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView text(String s, float sp, boolean bold, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private LinearLayout cardBox(int accent) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(14), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(card());
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(accent == 0 ? 1 : 2), accent == 0 ? rule() : accent);
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView button(String s, boolean marker, View.OnClickListener l) {
        TextView b = text(s, 16, true, marker ? MARKER_INK : ink());
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(18), dp(12), dp(18), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(marker ? MARKER : card());
        bg.setCornerRadius(dp(8));
        if (!marker) bg.setStroke(dp(2), ink());
        b.setBackground(bg);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        b.setLayoutParams(lp);
        return b;
    }

    /** Смужка прогресу: яка частина запасу вже використана. */
    private View bar(float used) {
        LinearLayout track = new LinearLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(rule());
        bg.setCornerRadius(dp(4));
        track.setBackground(bg);
        View fill = new View(this);
        GradientDrawable fg = new GradientDrawable();
        fg.setColor(used >= 1f ? RED : MARKER);
        fg.setCornerRadius(dp(4));
        fill.setBackground(fg);
        float u = Math.max(0f, Math.min(1f, used));
        track.addView(fill, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, u));
        track.addView(new View(this), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f - u));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8));
        lp.topMargin = dp(10);
        track.setLayoutParams(lp);
        return track;
    }

    // ---------- Екран ----------

    private boolean serviceOn() {
        String list = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(list)) return false;
        String me = new ComponentName(this, LimitService.class).flattenToString();
        String meShort = new ComponentName(this, LimitService.class).flattenToShortString();
        for (String s : list.split(":")) if (s.equalsIgnoreCase(me) || s.equalsIgnoreCase(meShort)) return true;
        return false;
    }

    /** Чи служба справді працює (а не лише ввімкнена в налаштуваннях і вбита системою). */
    private boolean serviceRunning() {
        AccessibilityManager am = (AccessibilityManager) getSystemService(ACCESSIBILITY_SERVICE);
        if (am == null) return true;
        List<AccessibilityServiceInfo> list = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        String me = new ComponentName(this, LimitService.class).flattenToShortString();
        for (AccessibilityServiceInfo i : list) {
            if (me.equalsIgnoreCase(i.getId()) || i.getId().endsWith("/.LimitService") && i.getId().startsWith(getPackageName())) return true;
        }
        return false;
    }

    private boolean batteryFree() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    /** Xiaomi: «Автозапуск» живе в застосунку «Безпека». Інші телефони — сторінка застосунку. */
    private void openAutostart() {
        Intent miui = new Intent().setComponent(new ComponentName("com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        try {
            startActivity(miui);
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }

    private void askBattery() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    private void render() {
        box.removeAllViews();
        Calendar now = Calendar.getInstance();
        int s = Limits.sessionIndex(now);
        boolean brother = Limits.brotherOn(this);

        box.addView(text("Ліміт телефона", 26, true, ink()));
        box.addView(text("3 години на день, сесіями. Telegram, Viber, браузер, Deutsch-Trainer і Хімія — без ліміту.", 14, false, ink2()));

        if (!serviceOn()) {
            LinearLayout c = cardBox(MARKER);
            c.addView(text("Охоронець ліміту вимкнений", 17, true, ink()));
            c.addView(text("Без нього час не рахується. Відкрийте «Спеціальні можливості» → «Охоронець ліміту» → увімкнути.", 14, false, ink2()));
            c.addView(button("Увімкнути", true, v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))));
            box.addView(c);
        } else if (!serviceRunning()) {
            LinearLayout c = cardBox(RED);
            c.addView(text("Охоронець зупинився", 17, true, RED));
            c.addView(text("Телефон вимкнув його, щоб зекономити батарею, тому час зараз не рахується. "
                    + "У «Спеціальних можливостях» вимкніть «Охоронець ліміту» і одразу ввімкніть знову. "
                    + "Щоб це не повторювалось — дозвольте автозапуск і роботу без обмежень батареї (кнопки нижче).", 14, false, ink2()));
            c.addView(button("Спеціальні можливості", true, v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))));
            box.addView(c);
        }
        if (!batteryFree()) {
            LinearLayout c = cardBox(MARKER);
            c.addView(text("Щоб телефон не вимикав охоронця", 17, true, ink()));
            c.addView(text("1. «Без обмежень батареї» — натисніть і погодьтесь.\n2. «Автозапуск» — увімкніть для Ліміту і Deutsch-Trainer.", 14, false, ink2()));
            c.addView(button("Без обмежень батареї", true, v -> askBattery()));
            c.addView(button("Автозапуск", false, v -> openAutostart()));
            box.addView(c);
        }

        if (kicked && !Limits.hasTime(this, now)) {
            LinearLayout c = cardBox(RED);
            c.addView(text("Час вийшов", 20, true, RED));
            c.addView(text(nextText(now) + "\nХочеш ще? Кожен новий зданий урок німецької чи хімії — +5 хв екстра-часу. "
                    + "Самі уроки час не їдять.", 15, false, ink()));
            c.addView(button("Урок німецької", true, v -> openTrainer()));
            c.addView(button("Урок хімії", false, v -> openChem()));
            box.addView(c);
        }

        // Поточна сесія
        LinearLayout cur = cardBox(brother ? 0 : ink());
        if (s < 0) {
            cur.addView(text("Нічна пауза 00:00–05:00", 17, true, ink()));
            cur.addView(text("Уночі запасу немає. " + nextText(now), 15, false, ink2()));
        } else {
            int[] ss = Limits.SESSIONS[s];
            long total = ss[2] * 60L;
            long left = Limits.leftSec(this, now);
            cur.addView(text("Зараз: " + Limits.hhmm(ss[0]) + "–" + Limits.hhmm(ss[1]), 14, false, ink2()));
            cur.addView(text("Лишилось " + Limits.fmt(left), 30, true, left > 0 ? ink() : RED));
            cur.addView(text("з " + Limits.fmt(total) + " у цій сесії", 14, false, ink2()));
            cur.addView(bar(1f - left / (float) total));
        }
        box.addView(cur);

        // Екстра-час за уроки
        long bank = Limits.bankSec(this);
        boolean onBank = Limits.onBank(this, now);
        LinearLayout ex = cardBox(onBank ? MARKER : 0);
        ex.addView(text(onBank ? "Зараз іде екстра-час" : "Екстра-час", 17, true, ink()));
        ex.addView(text("У запасі " + Limits.fmt(bank), 22, true, bank > 0 ? ink() : ink2()));
        int todayN = Limits.bonusToday(this, now);
        ex.addView(text("Кожен новий зданий урок німецької чи хімії — +" + Limits.BONUS_MIN + " хв. "
                + "Запас не згорає і вмикається сам, коли скінчився час сесії (крім ночі)."
                + (todayN > 0 ? "\nСьогодні зароблено: +" + (todayN * Limits.BONUS_MIN) + " хв." : ""), 14, false, ink2()));
        box.addView(ex);

        // Усі сесії дня
        LinearLayout day = cardBox(0);
        day.addView(text("Сьогодні", 17, true, ink()));
        for (int i = 0; i < Limits.SESSIONS.length; i++) {
            int[] ss = Limits.SESSIONS[i];
            long used = Math.min(ss[2] * 60L, Limits.usedSec(this, now, i));
            String mark = i == s ? "▶ " : now.get(Calendar.HOUR_OF_DAY) >= ss[1] ? "✓ " : "   "; // ▶ зараз, ✓ минула
            TextView row = text(mark + Limits.hhmm(ss[0]) + "–" + Limits.hhmm(ss[1]) + "   " + Limits.fmt(used) + " з " + Limits.fmt(ss[2] * 60L), 15, i == s, i == s ? ink() : ink2());
            row.setPadding(0, dp(8), 0, 0);
            day.addView(row);
        }
        box.addView(day);

        // Режим брата
        long bLeft = Limits.brotherLeftSec(this, now);
        LinearLayout br = cardBox(brother ? MARKER : 0);
        br.addView(text(brother ? "Режим брата увімкнено" : "Режим брата", 17, true, ink()));
        br.addView(text("Окрема година на день, твій час не витрачається. Вимикається сам, коли гасне екран.", 14, false, ink2()));
        br.addView(text("Лишилось " + Limits.fmt(bLeft) + " з " + Limits.BROTHER_MIN + " хв", 18, true, bLeft > 0 ? ink() : RED));
        br.addView(bar(1f - bLeft / (Limits.BROTHER_MIN * 60f)));
        if (brother) {
            br.addView(button("Вимкнути режим брата", false, v -> { Limits.setBrother(this, false); render(); }));
        } else if (bLeft > 0) {
            br.addView(button("Увімкнути режим брата", true, v -> confirmBrother()));
        } else {
            br.addView(text("Година брата на сьогодні закінчилась.", 14, false, ink2()));
        }
        box.addView(br);

        box.addView(button("Відкрити Deutsch-Trainer", false, v -> openTrainer()));
        box.addView(button("Відкрити Хімію", false, v -> openChem()));
        if (batteryFree()) box.addView(button("Автозапуск (щоб охоронець не зупинявся)", false, v -> openAutostart()));
    }

    /** «Наступна сесія о 10:00 — 30 хв.» */
    private String nextText(Calendar now) {
        int[] n = Limits.nextSession(now);
        int[] ss = Limits.SESSIONS[n[0]];
        return "Наступна сесія " + (n[1] == 1 ? "завтра " : "") + "о " + Limits.hhmm(ss[0]) + " — " + Limits.fmt(ss[2] * 60L) + ".";
    }

    private void confirmBrother() {
        new AlertDialog.Builder(this)
                .setTitle("Увімкнути режим брата?")
                .setMessage("Час піде з братової години, а не з твого. Коли брат поверне телефон і екран погасне, режим вимкнеться сам.")
                .setPositiveButton("Увімкнути", (d, w) -> { Limits.setBrother(this, true); render(); })
                .setNegativeButton("Скасувати", null)
                .show();
    }

    private void openChem() {
        try {
            startActivity(new Intent().setComponent(new ComponentName("com.deutschtrainer.app", "com.deutschtrainer.app.ChemActivity"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            openTrainer();
        }
    }

    private void openTrainer() {
        Intent i = getPackageManager().getLaunchIntentForPackage("com.deutschtrainer.app");
        if (i != null) startActivity(i);
    }
}

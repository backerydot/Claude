package com.deutschtrainer.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Головний екран: смуга стану охоронця вгорі, під нею сайт-тренер у WebView.
 * Сайт спілкується із застосунком через window.DTApp (клас Bridge нижче):
 * повідомляє результат вправ, просить озвучити німецьку і зберегти копію прогресу.
 */
public class MainActivity extends Activity {
    static final String EXTRA_KICKED = "kicked";
    private static final int REQ_IMPORT = 1;
    private static final int REQ_EXPORT = 2;

    private WebView web;
    private LinearLayout banner;
    private View bannerAccent;
    private TextView bannerTitle;
    private TextView bannerText;
    private TextView bannerButton;
    private String siteUrl;
    private boolean dark;

    private TextToSpeech tts;
    private boolean ttsReady;

    private ValueCallback<Uri[]> pendingImport;
    private String pendingExport;

    // Раз на 30 секунд оновлюємо смугу: о 18:00 і о 4:00 стан змінюється сам
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            refreshBanner();
            handler.postDelayed(this, 30_000);
        }
    };

    /** Хімія — та сама активність, але інша сторінка й без смуги охоронця (див. ChemActivity). */
    boolean isChem() {
        return false;
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        siteUrl = getString(R.string.site_url);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        setupBars();
        setContentView(buildLayout());
        setupWebView();
        setupTts();
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(isChem() ? siteUrl + "chem/" : siteUrl);
        handleKick(getIntent());
        if (isChem()) banner.setVisibility(View.GONE);
        // Android 13+: дозвіл на тихе сповіщення охоронця (без нього MIUI швидше його вбиває)
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 3);
        }
    }

    // ---------- Вигляд ----------

    private int paper() {
        return dark ? 0xFF111830 : 0xFFFBFCFA;
    }

    private int ink() {
        return dark ? 0xFFE8EDF8 : 0xFF1A2340;
    }

    private void setupBars() {
        getWindow().setStatusBarColor(paper());
        getWindow().setNavigationBarColor(paper());
        if (!dark) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(paper());

        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.HORIZONTAL);
        banner.setGravity(Gravity.CENTER_VERTICAL);
        banner.setPadding(0, 0, dp(12), 0);

        bannerAccent = new View(this);
        banner.addView(bannerAccent, new LinearLayout.LayoutParams(dp(5), ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setPadding(dp(14), dp(10), dp(8), dp(10));
        bannerTitle = new TextView(this);
        bannerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        bannerTitle.setTypeface(Typeface.DEFAULT_BOLD);
        bannerTitle.setTextColor(ink());
        bannerText = new TextView(this);
        bannerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        bannerText.setTextColor(ink());
        bannerText.setAlpha(0.8f);
        texts.addView(bannerTitle);
        texts.addView(bannerText);
        banner.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Кнопка — жовтий текстовиділювач, як головна кнопка на сайті
        bannerButton = new TextView(this);
        bannerButton.setText("Увімкнути");
        bannerButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        bannerButton.setTypeface(Typeface.DEFAULT_BOLD);
        bannerButton.setTextColor(0xFF1A2340);
        bannerButton.setPadding(dp(14), dp(9), dp(14), dp(9));
        GradientDrawable marker = new GradientDrawable();
        marker.setColor(0xFFFFE04A);
        marker.setCornerRadius(dp(4));
        bannerButton.setBackground(marker);
        bannerButton.setOnClickListener(v -> showGuardSetup());
        banner.addView(bannerButton);

        root.addView(banner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        View rule = new View(this);
        rule.setBackgroundColor(dark ? 0xFF2A3555 : 0xFFCCD6E5);
        root.addView(rule, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

        web = new WebView(this);
        web.setBackgroundColor(paper());
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return root;
    }

    /** Смуга вгорі: охоронець вимкнений / закрито / вільно. */
    private void refreshBanner() {
        Calendar now = Calendar.getInstance();
        int bg;
        int accent;
        if (isChem()) return;
        boolean enabled = isGuardEnabled();
        boolean running = enabled && isGuardRunning();
        if (!running || !batteryFree()) {
            bg = dark ? 0xFF373834 : 0xFFFFF4B0;
            accent = 0xFFFFE04A;
            if (!enabled) {
                bannerTitle.setText("Охоронець вимкнений");
                bannerText.setText("TikTok і YouTube зараз не блокуються");
                bannerButton.setText("Увімкнути");
            } else if (!running) {
                bannerTitle.setText("Охоронець зупинився");
                bannerText.setText("Телефон вимкнув його. Вимкніть і знову ввімкніть у «Спеціальних можливостях»");
                bannerButton.setText("Виправити");
            } else {
                bannerTitle.setText("Охоронця може вимкнути батарея");
                bannerText.setText("Дозвольте роботу без обмежень і автозапуск");
                bannerButton.setText("Дозволити");
            }
            bannerButton.setVisibility(View.VISIBLE);
        } else if (Schedule.isLocked(this, now)) {
            bg = dark ? 0xFF37293B : 0xFFFBE9E7;
            accent = dark ? 0xFFFF8073 : 0xFFC8372D;
            bannerTitle.setText("TikTok і YouTube закриті");
            bannerText.setText(Schedule.lockedReason(now) + ". Здайте новий урок на 1 — і вони відкриються одразу.");
            bannerButton.setVisibility(View.GONE);
        } else {
            bg = dark ? 0xFF1B363F : 0xFFE6F4EC;
            accent = dark ? 0xFF4FD18B : 0xFF13824B;
            bannerTitle.setText("TikTok і YouTube відкриті ✓");
            bannerText.setText(Schedule.isEvening(now)
                    ? "Вечірній урок зараховано. Відкриті аж до 4:00 ранку."
                    : "Ранковий урок зараховано. Відкриті аж до 18:00, потім — вечірній урок.");
            bannerButton.setVisibility(View.GONE);
        }
        banner.setBackgroundColor(bg);
        bannerAccent.setBackgroundColor(accent);
    }

    // ---------- Охоронець ----------

    /** Чи увімкнено службу в «Спеціальних можливостях». */
    private boolean isGuardEnabled() {
        String list = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        ComponentName me = new ComponentName(this, GuardService.class);
        TextUtils.SimpleStringSplitter parts = new TextUtils.SimpleStringSplitter(':');
        parts.setString(list);
        for (String s : parts) {
            if (me.equals(ComponentName.unflattenFromString(s))) return true;
        }
        return false;
    }

    /** Служба справді працює (а не лише позначена в налаштуваннях, поки MIUI її вбив). */
    private boolean isGuardRunning() {
        AccessibilityManager am = (AccessibilityManager) getSystemService(ACCESSIBILITY_SERVICE);
        if (am == null) return true;
        List<AccessibilityServiceInfo> list = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        ComponentName me = new ComponentName(this, GuardService.class);
        for (AccessibilityServiceInfo i : list) {
            if (me.equals(ComponentName.unflattenFromString(i.getId()))) return true;
        }
        return false;
    }

    private boolean batteryFree() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void showGuardSetup() {
        if (isGuardEnabled() && isGuardRunning()) {
            showBatterySetup();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Як увімкнути охоронця")
                .setMessage("1. Натисніть «Спеціальні можливості», знайдіть «Встановлені застосунки» "
                        + "(або «Завантажені служби») → «Охоронець Deutsch-Trainer» і увімкніть.\n\n"
                        + "2. Якщо перемикач сірий і телефон пише про обмежене налаштування: "
                        + "натисніть «Про застосунок» → меню ⋮ угорі праворуч → "
                        + "«Дозволити обмежені налаштування». Потім повторіть крок 1.")
                .setPositiveButton("Спеціальні можливості", (d, w) ->
                        openSettings(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
                .setNeutralButton("Про застосунок", (d, w) ->
                        openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName()))))
                .show();
    }

    /** Щоб MIUI не вбивав охоронця: без обмежень батареї + автозапуск. */
    private void showBatterySetup() {
        new AlertDialog.Builder(this)
                .setTitle("Щоб охоронець не зупинявся")
                .setMessage("1. «Батарея» → погодьтесь працювати без обмежень.\n\n"
                        + "2. «Автозапуск» → увімкніть для Deutsch-Trainer і Ліміту.")
                .setPositiveButton("Батарея", (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        openSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    }
                })
                .setNeutralButton("Автозапуск", (d, w) -> {
                    try {
                        startActivity(new Intent().setComponent(new ComponentName("com.miui.securitycenter",
                                "com.miui.permcenter.autostart.AutoStartManagementActivity")));
                    } catch (Exception e) {
                        openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName())));
                    }
                })
                .show();
    }

    private void openSettings(Intent i) {
        try {
            startActivity(i);
        } catch (Exception e) {
            toast("Не вдалося відкрити налаштування");
        }
    }

    /** Охоронець щойно викинув з TikTok / YouTube і відкрив тренер. */
    private void handleKick(Intent intent) {
        if (intent == null || !intent.hasExtra(EXTRA_KICKED)) return;
        intent.removeExtra(EXTRA_KICKED);
        toast("TikTok і YouTube закриті: спочатку новий урок на 1");
    }

    // ---------- Сайт ----------

    private void setupWebView() {
        // Тестова збірка з локальним сервером (http://…) — дозволяємо налагодження сторінки з ПК
        if (siteUrl.startsWith("http://")) WebView.setWebContentsDebuggingEnabled(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                // прогрес живе в localStorage
        s.setMediaPlaybackRequiresUserGesture(false); // звуки в стрес-тесті
        web.addJavascriptInterface(new Bridge(), "DTApp");
        if (isChem()) web.addJavascriptInterface(new ChemBridge(), "ChemApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Сторінки тренера — тут, усе інше — у звичайному браузері
                if (req.getUrl().toString().startsWith(siteUrl)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
                } catch (Exception ignored) {
                    // немає чим відкрити — нічого страшного
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline();
            }
        });

        // «Відновити з копії» на сайті — вибір файлу
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingImport != null) pendingImport.onReceiveValue(null);
                pendingImport = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(i, REQ_IMPORT);
                    return true;
                } catch (Exception e) {
                    pendingImport = null;
                    return false;
                }
            }
        });
    }

    private void showOffline() {
        String bg = dark ? "#111830" : "#fbfcfa";
        String fg = dark ? "#e8edf8" : "#1a2340";
        String html = "<!doctype html><meta name=viewport content='width=device-width'>"
                + "<body style='font-family:sans-serif;padding:24px;background:" + bg + ";color:" + fg + "'>"
                + "<h2>Немає інтернету</h2><p>Тренер завантажується з сайту. Перевірте з’єднання.</p>"
                + "<p><a href='" + siteUrl + "' style='display:inline-block;padding:10px 16px;"
                + "background:#ffe04a;color:#1a2340;font-weight:bold;text-decoration:none'>"
                + "Спробувати ще раз</a></p></body>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** Те, що бачить сайт як window.DTApp. Методи викликаються не з головного потоку. */
    final class Bridge {
        /** Результат вправ. Повертає JSON {counted, title, text} — сайт покаже його під оцінкою. */
        @JavascriptInterface
        public String lessonPassed(String lessonId, int pct, boolean isNew) {
            String result = Schedule.lessonPassed(MainActivity.this, lessonId, pct, isNew);
            runOnUiThread(MainActivity.this::refreshBanner);
            // Урок на 1 уперше — ще й +5 хв у «Ліміті» (повтори «Ліміт» сам не рахує)
            String bonus = pct >= Schedule.PASS ? Bonus.grant(MainActivity.this, "de:" + lessonId) : null;
            if (bonus == null) return result;
            try {
                JSONObject o = new JSONObject(result);
                if (o.optString("text").isEmpty()) {
                    o.put("counted", true).put("title", "Екстра-час!").put("text", bonus);
                } else if (o.optBoolean("counted")) {
                    o.put("text", o.optString("text") + " " + bonus);
                } else {
                    o.put("text", o.optString("text") + " А за новий урок: " + bonus);
                }
                return o.toString();
            } catch (Exception e) {
                return result;
            }
        }

        @JavascriptInterface
        public void speak(String text, double rate, double pitch, String id) {
            runOnUiThread(() -> doSpeak(text, (float) rate, (float) pitch, id));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (tts != null) tts.stop();
            });
        }

        /** «Зберегти копію»: користувач вибирає, куди покласти файл. */
        @JavascriptInterface
        public void saveBackup(String name, String json) {
            runOnUiThread(() -> {
                pendingExport = json;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_EXPORT);
                } catch (Exception e) {
                    pendingExport = null;
                    toast("Не вдалося зберегти копію");
                }
            });
        }
    }

    /** window.ChemApp — лише в «Хімії». */
    final class ChemBridge {
        /** Урок хімії здано вперше (сайт сам перевіряє, що вперше). JSON {title, text} або {}. */
        @JavascriptInterface
        public String lessonPassed(String lessonId, int pct) {
            String bonus = Bonus.grant(MainActivity.this, "chem:" + lessonId);
            if (bonus == null) return "{}";
            try {
                return new JSONObject().put("title", "Екстра-час!").put("text", bonus).toString();
            } catch (Exception e) {
                return "{}";
            }
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        Uri uri = res == RESULT_OK && data != null ? data.getData() : null;
        if (req == REQ_IMPORT) {
            if (pendingImport != null) pendingImport.onReceiveValue(uri == null ? null : new Uri[]{uri});
            pendingImport = null;
        } else if (req == REQ_EXPORT) {
            String json = pendingExport;
            pendingExport = null;
            if (uri == null || json == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                toast("Копію збережено");
            } catch (Exception e) {
                toast("Не вдалося зберегти копію");
            }
        } else {
            super.onActivityResult(req, res, data);
        }
    }

    // ---------- Озвучка голосом телефона ----------

    private void setupTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(Locale.GERMANY);
            ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            if (!ttsReady) {
                toast("Немає німецького голосу. Налаштування → Синтез мовлення → завантажте німецьку мову");
            }
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
            }

            @Override
            public void onDone(String id) {
                spoken(id);
            }

            @Override
            @Deprecated
            public void onError(String id) {
                spoken(id);
            }

            @Override
            public void onError(String id, int code) {
                spoken(id);
            }

            @Override
            public void onStop(String id, boolean interrupted) {
                spoken(id);
            }
        });
    }

    private void doSpeak(String text, float rate, float pitch, String id) {
        if (!ttsReady) {
            spoken(id);
            return;
        }
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
    }

    /** Сказати сайту, що фразу договорено (див. window.__dtSpoken у js/speech.js). */
    private void spoken(String id) {
        web.post(() -> web.evaluateJavascript(
                "window.__dtSpoken && window.__dtSpoken(" + JSONObject.quote(id) + ")", null));
    }

    // ---------- Життєвий цикл ----------

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleKick(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(tick);
        if (tts != null) tts.stop();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }
}

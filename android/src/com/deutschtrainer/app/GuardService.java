package com.deutschtrainer.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

/**
 * Охоронець. Служба спеціальних можливостей отримує події від TikTok, YouTube
 * і браузерів (список — у res/xml/guard_service.xml). Якщо зараз закрито
 * (див. Schedule), повертає на головний екран і відкриває тренер.
 */
public class GuardService extends AccessibilityService {
    private long lastKick = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        CharSequence pkg = event.getPackageName();
        if (pkg == null || !Schedule.isLocked(this)) return;
        String p = pkg.toString();

        if (isBlockedApp(p)) {
            kick("app");
            return;
        }
        String urlBarId = urlBarId(p);
        if (urlBarId != null && browserShowsBlockedSite(urlBarId)) {
            kick("web");
        }
    }

    private static boolean isBlockedApp(String p) {
        for (String b : Schedule.BLOCKED_APPS) if (b.equals(p)) return true;
        return false;
    }

    private static String urlBarId(String p) {
        for (String[] b : Schedule.BROWSERS) if (b[0].equals(p)) return b[1];
        return null;
    }

    private boolean browserShowsBlockedSite(String urlBarId) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        List<AccessibilityNodeInfo> bars = root.findAccessibilityNodeInfosByViewId(urlBarId);
        for (AccessibilityNodeInfo bar : bars) {
            if (Schedule.isBlockedUrl(bar.getText())) return true;
        }
        return false;
    }

    /** Закрити заборонене: на головний екран, а зверху — тренер з поясненням. */
    private void kick(String why) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastKick < 1500) return; // події йдуть пачками — не смикаємо телефон щоразу
        lastKick = now;
        performGlobalAction(GLOBAL_ACTION_HOME);
        // Тренер відкриваємо трохи згодом: інакше головний екран ляже поверх нього
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_KICKED, why);
        handler.postDelayed(() -> startActivity(i), 500);
    }

    @Override
    public void onInterrupt() {
        // нічого не озвучуємо — перебивати нічого
    }
}

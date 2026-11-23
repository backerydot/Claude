package com.deutschtrainer.limit;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.Calendar;

/**
 * Охоронець ліміту. Служба спеціальних можливостей знає, який застосунок зараз на екрані.
 * Кожні 5 секунд, поки екран увімкнений і розблокований, додає час, якщо застосунок
 * не з білого списку. Коли запас вичерпано — повертає на головний екран і відкриває Ліміт.
 */
public class LimitService extends AccessibilityService {
    private static final long TICK_MS = 5_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String current = "";      // пакет застосунку на екрані
    private long lastTick = 0;
    private long lastKick = 0;
    private boolean warned5, warned1; // попередження «лишилось 5 хв / 1 хв» у цій сесії
    private String warnKey = "";

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            onTick();
            handler.postDelayed(this, TICK_MS);
        }
    };

    // Екран погас — облік на паузу і режим брата вимикається (телефон повернули власнику)
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) {
                onTick(); // дорахувати останні секунди
                handler.removeCallbacks(tick);
                Limits.setBrother(LimitService.this, false);
            } else {
                lastTick = SystemClock.elapsedRealtime();
                handler.removeCallbacks(tick);
                handler.postDelayed(tick, TICK_MS);
            }
        }
    };

    @Override
    protected void onServiceConnected() {
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screen, f);
        lastTick = SystemClock.elapsedRealtime();
        handler.postDelayed(tick, TICK_MS);
        updateNotification(Calendar.getInstance());
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        KeepAlive.hide(this);
        try { unregisterReceiver(screen); } catch (IllegalArgumentException ignored) { }
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg == null) return;
        String p = pkg.toString();
        if (Limits.isIgnored(this, p)) return; // шторка, клавіатура — застосунок під ними той самий
        if (!p.equals(current)) {
            onTick(); // час до перемикання — попередньому застосунку
            current = p;
        }
        checkNow();
    }

    /** Що зараз на екрані насправді (на випадок пропущених подій). */
    private String foreground() {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null && root.getPackageName() != null) {
                String p = root.getPackageName().toString();
                if (!Limits.isIgnored(this, p)) current = p;
            }
        } catch (RuntimeException ignored) { }
        return current;
    }

    private boolean screenInUse() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        return pm != null && pm.isInteractive() && (km == null || !km.isKeyguardLocked());
    }

    private void onTick() {
        long now = SystemClock.elapsedRealtime();
        long sec = Math.min(TICK_MS * 2, now - lastTick) / 1000; // не більше 10 с: сон не рахуємо
        lastTick = now - (now - lastTick) % 1000;                 // залишок мілісекунд не губимо
        if (sec <= 0 || !screenInUse()) return;
        Calendar cal = Calendar.getInstance();
        updateNotification(cal);
        String p = foreground();
        if (p.isEmpty() || Limits.isAllowed(this, p)) return;
        boolean wasOnBank = Limits.onBank(this, cal);
        Limits.addUsage(this, cal, sec);
        if (!wasOnBank && Limits.onBank(this, cal)) {
            Toast.makeText(this, "Основний час вийшов — пішов екстра-час: " + Limits.fmt(Limits.bankSec(this)), Toast.LENGTH_LONG).show();
        }
        warn(cal);
        checkNow();
    }

    /** Попередити за 5 і за 1 хвилину до кінця. */
    private void warn(Calendar cal) {
        boolean brother = Limits.brotherOn(this);
        String key = brother ? "b" + Limits.dayKey(cal) : Limits.dayKey(cal) + "/" + Limits.sessionIndex(cal);
        if (!key.equals(warnKey)) { warnKey = key; warned5 = false; warned1 = false; }
        long left = Limits.totalLeftSec(this, cal); // разом з екстра-часом
        String who = brother ? "Режим брата: " : "";
        if (left <= 60 && left > 0 && !warned1) {
            warned1 = true;
            Toast.makeText(this, who + "лишилась 1 хвилина", Toast.LENGTH_LONG).show();
        } else if (left <= 300 && left > 60 && !warned5) {
            warned5 = true;
            Toast.makeText(this, who + "лишилось 5 хвилин", Toast.LENGTH_LONG).show();
        }
    }

    /** Сповіщення-«пульс»: скільки лишилось. Оновлюється лише коли змінилась хвилина. */
    private void updateNotification(Calendar cal) {
        String title;
        if (Limits.brotherOn(this)) {
            title = "Режим брата: лишилось " + Limits.fmt(Limits.brotherLeftSec(this, cal));
        } else if (Limits.sessionIndex(cal) < 0) {
            title = "Нічна пауза до 05:00";
        } else if (Limits.onBank(this, cal)) {
            title = "Екстра-час: " + Limits.fmt(Limits.bankSec(this));
        } else {
            title = "Лишилось " + Limits.fmt(Limits.leftSec(this, cal));
        }
        long bank = Limits.bankSec(this);
        String text = bank > 0 && !Limits.onBank(this, cal)
                ? "У запасі ще " + Limits.fmt(bank) + " екстра-часу за уроки"
                : "Урок німецької або хімії — +5 хв екстра-часу";
        KeepAlive.show(this, title, text);
    }

    /** Якщо час вийшов, а на екрані не дозволений застосунок — закрити його. */
    private void checkNow() {
        String p = current;
        if (p.isEmpty() || Limits.isAllowed(this, p) || !screenInUse()) return;
        if (Limits.hasTime(this, Calendar.getInstance())) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastKick < 1500) return; // події йдуть пачками — не смикаємо телефон щоразу
        lastKick = now;
        performGlobalAction(GLOBAL_ACTION_HOME);
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_KICKED, true);
        handler.postDelayed(() -> startActivity(i), 500); // інакше головний екран ляже поверх
    }

    @Override
    public void onInterrupt() { }
}

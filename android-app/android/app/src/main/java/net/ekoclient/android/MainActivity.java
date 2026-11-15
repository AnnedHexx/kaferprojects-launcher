package net.ekoclient.android;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EkoNativePlugin.class);
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
    }

    /**
     * Modo juego: oculta la barra de estado y la de navegación.
     * Se pueden mostrar temporalmente deslizando desde el borde.
     */
    private void enableImmersiveMode() {
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } catch (Exception ignored) {
            // Si el fabricante no soporta el modo inmersivo, la app sigue funcionando.
        }
    }
}

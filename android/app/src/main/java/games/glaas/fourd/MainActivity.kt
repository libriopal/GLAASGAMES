package games.glaas.fourd

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * The whole Android side of the app.
 *
 * It is deliberately this small. The game is the web bundle in `assets/`; this
 * activity's entire job is to give it a full-screen, hardware-accelerated
 * WebView, serve the bundled files over an https origin, and get out of the way.
 * Every line below exists to remove a specific failure mode rather than to add a
 * feature.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the system bars so the page's own env(safe-area-inset-*)
        // values are non-zero and the control layout can inset itself. Without
        // this the insets report zero, the layout believes it has the whole
        // screen, and the controls land under the gesture bar.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        webView = WebView(this)
        setContentView(webView)

        // Consume the insets here rather than letting the framework pad the
        // WebView: padding it would shrink the viewport and the CSS insets would
        // then double-count, pushing the controls inward twice.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            WindowInsetsCompat.CONSUMED
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage, for nothing yet
            // The app has no network permission, so these are belt and braces:
            // even if something tried to reach out, it could not.
            allowFileAccess = false
            allowContentAccess = false
            blockNetworkLoads = true
            cacheMode = WebSettings.LOAD_NO_CACHE
            mediaPlaybackRequiresUserGesture = true
            // The page sets its own viewport meta; letting the WebView apply its
            // own zoom heuristics on top would break the dp-based control layout.
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100                    // ignore the system font scale for
                                              // canvas HUD text, which is drawn
                                              // to a fixed pixel grid
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Serves src/main/assets over https://appassets.androidplatform.net/,
        // which is a secure context with ordinary same-origin behaviour. Loading
        // from file:// instead would require relaxing WebView security settings
        // to make module scripts and fetch() work — exactly the configuration
        // that turns a local bug into a real vulnerability.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            /**
             * Nothing in this app navigates anywhere. Any attempt to leave the
             * asset origin is refused outright rather than opened in a browser:
             * there is no legitimate outbound link, so a request to follow one
             * means something has gone wrong.
             */
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = request.url.host != ASSET_HOST
        }

        // The system back gesture should leave the game, not unwind the
        // WebView's history — there is one page and no history to unwind, and a
        // back press that appears to do nothing reads as a frozen app.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl("https://$ASSET_HOST/assets/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    /**
     * Pausing the WebView stops its timers and its rendering.
     *
     * Without this the requestAnimationFrame loop keeps running behind the lock
     * screen, which drains the battery for a game nobody is looking at. Play's
     * review looks for exactly this class of background behaviour.
     */
    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    /**
     * Immersive, but the sticky variety: a swipe from an edge reveals the bars
     * temporarily and they hide again on their own. The non-sticky mode would
     * make the first swipe near a control permanently change the layout
     * mid-game.
     */
    private fun hideSystemBars() {
        @Suppress("DEPRECATION")
        webView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
    }
}

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "games.glaas.fourd"

  // Play requires new apps to target Android 16 (API 36) or higher as of
  // 31 August 2026, and existing apps to be updated to it to remain
  // discoverable. Targeting the current level is not optional for a submission.
  compileSdk = 36

  defaultConfig {
    applicationId = "games.glaas.fourd"
    // API 24 covers effectively the whole install base still receiving Play
    // distribution while guaranteeing WebGL2 in the System WebView.
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0.0"
    // No test runner is declared: there are no instrumented tests, and
    // declaring a runner nothing uses is a dependency for nothing.
  }

  // The web assets are staged by scripts/build-app-assets.mjs and copied here
  // by the assemble task below, rather than being checked in twice.
  sourceSets {
    named("main") {
      assets.srcDirs("src/main/assets")
    }
  }

  signingConfigs {
    create("release") {
      // Supplied by the CI or local environment; see android/README.md. When
      // absent the release build is left unsigned rather than silently falling
      // back to the debug key, because an APK signed with a debug key looks
      // releasable and is not.
      val storePath = System.getenv("GLAAS_KEYSTORE")
      if (storePath != null && file(storePath).exists()) {
        storeFile = file(storePath)
        storePassword = System.getenv("GLAAS_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("GLAAS_KEY_ALIAS")
        keyPassword = System.getenv("GLAAS_KEY_PASSWORD")
      }
    }
  }

  buildTypes {
    release {
      // The JavaScript is already the shipped artifact; there is no Kotlin worth
      // shrinking, and R8 on a 300-line activity buys nothing while adding a
      // failure mode between here and the store.
      isMinifyEnabled = false
      isShrinkResources = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val release = signingConfigs.getByName("release")
      if (release.storeFile != null) {
        signingConfig = release
      }
    }
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
    }
  }

  buildFeatures {
    // AGP 8 stopped generating BuildConfig by default. MainActivity uses
    // BuildConfig.DEBUG to gate WebView contents debugging, which must be off in
    // a release build — remote debugging left enabled on a shipped app is a real
    // finding, not a style point.
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }

  packaging {
    resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  // WebViewAssetLoader: serves the bundled assets over an https:// origin so the
  // page runs in a secure context with normal same-origin rules, instead of the
  // file:// origin that would force us to relax WebView security settings.
  implementation("androidx.webkit:webkit:1.11.0")
}

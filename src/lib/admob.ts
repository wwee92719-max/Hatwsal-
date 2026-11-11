import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
} from '@capacitor-community/admob';

// Google's public test ad units. Swap in the production IDs from .bolt/config.json
// and set IS_TESTING to false before publishing.
const IS_TESTING = true;
const BANNER_AD_ID = 'ca-app-pub-3940256099942544/6300978111';
const INTERSTITIAL_AD_ID = 'ca-app-pub-3940256099942544/1033173712';

export const BANNER_HEIGHT_PX = 50;

const isNative = () => Capacitor.isNativePlatform();

let initialized: Promise<void> | null = null;
let interstitialReady: Promise<unknown> | null = null;

export function initializeAds(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (!initialized) {
    initialized = AdMob.initialize({ initializeForTesting: IS_TESTING }).catch(() => {
      initialized = null;
    });
  }
  return initialized;
}

export async function showBannerAd(): Promise<void> {
  if (!isNative()) return;
  await initializeAds();
  await AdMob.showBanner({
    adId: BANNER_AD_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: IS_TESTING,
  }).catch(() => undefined);
}

export async function hideBannerAd(): Promise<void> {
  if (!isNative()) return;
  await AdMob.hideBanner().catch(() => undefined);
}

export async function prepareInterstitialAd(): Promise<void> {
  if (!isNative()) return;
  await initializeAds();
  interstitialReady = AdMob.prepareInterstitial({
    adId: INTERSTITIAL_AD_ID,
    isTesting: IS_TESTING,
  }).catch(() => null);
  await interstitialReady;
}

export async function showInterstitialAd(): Promise<void> {
  if (!isNative()) return;
  if (!interstitialReady) await prepareInterstitialAd();
  await interstitialReady;
  interstitialReady = null;
  await AdMob.showInterstitial().catch(() => undefined);
  void prepareInterstitialAd();
}

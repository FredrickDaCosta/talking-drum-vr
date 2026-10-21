import { AssetType, defineAssets } from '@iwsdk/core';
import { talkingDrumAsset } from './scene-assets/talking-drum.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'talking-drum': talkingDrumAsset,
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
});

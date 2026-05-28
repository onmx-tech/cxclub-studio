export const YCODE_FIGMA_SIGNATURE = '__ycode_figma__';

export interface YcodeNode {
  __class: 'FrameNode' | 'TextNode' | 'ImageNode' | 'SvgNode';
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  width: number;
  height: number;
  widthType: 'fixed' | 'fill' | 'hug';
  heightType: 'fixed' | 'fill' | 'hug';
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  aspectRatio?: number | null;
  rotation?: number;
  opacity: number;
  fillEnabled: boolean;
  fillType: 'color' | 'gradient' | 'image' | 'none';
  fillColor?: string;
  fillGradient?: string;
  borderEnabled: boolean;
  borderWidth: number;
  borderColor?: string;
  borderStyle: string;
  borderPerSide: boolean;
  borderTop?: number;
  borderRight?: number;
  borderBottom?: number;
  borderLeft?: number;
  radius: number;
  radiusPerCorner: boolean;
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomRight?: number;
  radiusBottomLeft?: number;
  boxShadow?: string;
  blur?: number;
  backdropBlur?: number;
  overflow: 'visible' | 'hidden';
  display?: 'flex' | 'grid' | 'block';
  flexDirection?: 'row' | 'column';
  flexWrap?: 'nowrap' | 'wrap';
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  textVerticalAlignment?: 'top' | 'center' | 'bottom';
  html?: string;
  imageData?: string;
  svgData?: string;
  children?: YcodeNode[];
}

export interface YcodeFigmaPayload {
  signature: typeof YCODE_FIGMA_SIGNATURE;
  version: 2;
  source: 'figma-plugin';
  nodes: YcodeNode[];
}

export function isYcodeFigmaPayload(data: unknown): data is YcodeFigmaPayload {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.signature === YCODE_FIGMA_SIGNATURE &&
    (obj.version === 1 || obj.version === 2) &&
    obj.source === 'figma-plugin' &&
    Array.isArray(obj.nodes)
  );
}

'use client';

function base64ToFile(dataUri: string, filename: string): File {
  const [meta, base64] = dataUri.split(',');
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function svgToFile(svgString: string, filename: string): File {
  return new File([svgString], filename, { type: 'image/svg+xml' });
}

async function uploadFile(file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', 'figma-import');

    const response = await fetch('/ycode/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.data?.id ?? null;
  } catch {
    return null;
  }
}

export async function uploadFigmaImage(
  base64DataUri: string,
  filename: string,
): Promise<string | null> {
  const file = base64ToFile(base64DataUri, filename);
  return uploadFile(file);
}

export async function uploadFigmaSvg(
  svgString: string,
  filename: string,
): Promise<string | null> {
  const file = svgToFile(svgString, filename);
  return uploadFile(file);
}

// Dominios con typos comunes que casi siempre generan hard bounce
const KNOWN_TYPO_DOMAINS = [
  'gmial.com', 'gmai.com', 'gmail.co', 'gnail.com', 'gmaill.com',
  'hotmial.com', 'hotmail.co', 'hotmal.com',
  'yahooo.com', 'yaho.com',
  'outlok.com', 'outllok.com',
];

/**
 * Valida el formato de un email para descartar direcciones claramente inválidas
 * antes de enviarlas a Amazon SES (evita hard bounces por typos/sintaxis).
 * No reemplaza una verificación real de buzón (ZeroBounce/NeverBounce), solo
 * filtra lo obviamente mal formado.
 */
export function isValidEmailSyntax(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();

  // Regex razonable para formato local@dominio.tld
  const basicPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!basicPattern.test(trimmed)) return false;

  if (trimmed.includes('..')) return false;

  const domain = trimmed.split('@')[1];
  if (KNOWN_TYPO_DOMAINS.includes(domain)) return false;

  return true;
}

/**
 * Optimiza automáticamente el HTML de la campaña para prevenir
 * la inversión de color agresiva en Gmail Dark Mode y Apple Mail.
 */
export function optimizeHtmlForDarkMode(html: string): string {
  if (!html) return html;

  // 1. Inyectar metatags y estilos CSS de compatibilidad en el <head>
  const metaTags = `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      /* --- COMPATIBILIDAD CON APPLE MAIL (DENTRO DE MEDIA QUERIES) --- */
      @media (prefers-color-scheme: dark) {
        .dm-keep-dark {
          background-color: #060b2b !important;
          background-image: linear-gradient(#060b2b, #060b2b) !important;
        }
        .dm-keep-white-text {
          color: #ffffff !important;
        }

        /* Fuerza colores originales en Apple Mail */
        [style*="color:#ffffff"] { color: #ffffff !important; }
        [style*="color: #ffffff"] { color: #ffffff !important; }
        [style*="color:#fff"] { color: #ffffff !important; }
        [style*="color: #fff"] { color: #ffffff !important; }
        [style*="color:#FFF"] { color: #ffffff !important; }
        [style*="color: #FFF"] { color: #ffffff !important; }
        [style*="color:rgb(255,255,255)"] { color: #ffffff !important; }
        [style*="color:rgb(255, 255, 255)"] { color: #ffffff !important; }
        [style*="color: rgb(255, 255, 255)"] { color: #ffffff !important; }
        [style*="color: rgb(255,255,255)"] { color: #ffffff !important; }
        
        [style*="color:#f7b500"] { color: #f7b500 !important; }
        [style*="color: #f7b500"] { color: #f7b500 !important; }
        [style*="color:#ffcc00"] { color: #ffcc00 !important; }
        [style*="color: #ffcc00"] { color: #ffcc00 !important; }
        [style*="color:#cccccc"] { color: #cccccc !important; }
        [style*="color: #cccccc"] { color: #cccccc !important; }
        [style*="color:#eeeeee"] { color: #eeeeee !important; }
        [style*="color: #eeeeee"] { color: #eeeeee !important; }
      }
    </style>
  `;

  let processedHtml = html;
  
  if (processedHtml.includes('</head>')) {
    processedHtml = processedHtml.replace('</head>', `${metaTags}</head>`);
  } else if (processedHtml.includes('<head>')) {
    processedHtml = processedHtml.replace('<head>', `<head>${metaTags}`);
  } else {
    processedHtml = metaTags + processedHtml;
  }

  // 2. Asegurar que la etiqueta body tenga la clase "body" para que funcione el selector de Gmail
  const bodyRegex = /<body([^>]*)>/i;
  processedHtml = processedHtml.replace(bodyRegex, (match, attrs) => {
    if (attrs.includes('class=')) {
      const classRegex = /class=["']([^"']*)["']/i;
      return match.replace(classRegex, (clsMatch, clsVal) => {
        if (clsVal.split(' ').includes('body')) {
          return clsMatch;
        }
        return `class="${clsVal} body"`;
      });
    } else {
      return `<body${attrs} class="body">`;
    }
  });

  // 3. Modificador de Gmail Dark Mode (desactivado para evitar inversión de color en SMTP)

  // 4. Encontrar estilos inline de color y añadirles text-shadow y data-ogsc (Capa 2 de seguridad)
  // Esto asegura que incluso si Gmail ignora el blend mode, el color del texto permanezca legible
  const colorRegex = /<([a-zA-Z0-9]+)\b([^>]*style=["']([^"']*color:\s*([^;'"\s>]+)[^"']*)["'][^>]*)>/gi;
  processedHtml = processedHtml.replace(colorRegex, (match, tagName, tagAttrs, styleContent, colorVal) => {
    if (tagAttrs.includes('data-ogsc=')) {
      return match;
    }

    const cleanColor = colorVal.trim().replace(/['"]/g, '');
    
    // Solo aplicar a colores claros (blanco, amarillos, grises claros)
    const isLightColor = /#(ffffff|fff|fefefe|fffffe|cccccc|eeeeee|e0e0e0|f7b500|ffcc00|ffff00|ffcc33)/i.test(cleanColor) || 
                         /rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i.test(cleanColor);
                         
    if (!isLightColor) {
      return match;
    }

    // Añadir text-shadow al estilo inline actual
    const styleTrimmed = styleContent.trim().replace(/;+$/, '');
    const updatedStyle = styleContent.includes('text-shadow') 
      ? styleContent 
      : `${styleTrimmed}; text-shadow: 0px 0px 1px ${cleanColor};`;

    // Reconstruir atributos del tag
    const updatedAttrs = tagAttrs.replace(styleContent, updatedStyle);
    return `<${tagName}${updatedAttrs} data-ogsc="color: ${cleanColor} !important;">`;
  });

  // 5. Encontrar estilos inline de background-color y añadirles data-ogsb y degradados
  const bgRegex = /<([a-zA-Z0-9]+)\b([^>]*style=["']([^"']*background-color:\s*([^;'"\s>]+)[^"']*)["'][^>]*)>/gi;
  processedHtml = processedHtml.replace(bgRegex, (match, tagName, tagAttrs, styleContent, colorVal) => {
    if (tagAttrs.includes('data-ogsb=')) {
      return match;
    }

    const cleanColor = colorVal.trim().replace(/['"]/g, '');
    const styleTrimmed = styleContent.trim().replace(/;+$/, '');
    const updatedStyle = styleContent.includes('background-image')
      ? styleContent
      : `${styleTrimmed}; background-image: linear-gradient(${cleanColor}, ${cleanColor});`;
      
    const updatedAttrs = tagAttrs.replace(styleContent, updatedStyle);
    return `<${tagName}${updatedAttrs} data-ogsb="background-color: ${cleanColor} !important;">`;
  });

  // 6. Garantizar que todas las imágenes tengan el atributo alt (si no está, agregar alt="")
  const imgRegex = /<img\b([^>]*?)(\/?>)/gi;
  processedHtml = processedHtml.replace(imgRegex, (match, attrs, end) => {
    if (/\balt\s*=/i.test(attrs)) {
      return match;
    }
    let cleanAttrs = attrs.trim();
    if (cleanAttrs.endsWith('/')) {
      cleanAttrs = cleanAttrs.substring(0, cleanAttrs.length - 1).trim();
    }
    return `<img ${cleanAttrs} alt="" />`;
  });

  return processedHtml;
}

/**
 * Agrega dinámicamente un footer de desuscripción elegante y responsivo en español,
 * adaptado a los colores de marca de Alimin Inmobiliaria.
 */
export function appendUnsubscribeFooter(html: string, leadId: string, email: string, appUrl: string): string {
  if (!html) return html;
  
  const unsubscribeUrl = `${appUrl}/unsubscribe?id=${leadId}`;
  const footerHtml = `
    <!-- START FOOTER UNSUBSCRIBE -->
    <div style="margin-top: 35px; padding-top: 25px; border-top: 1px solid #cbd6e2; text-align: center; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #516f90; line-height: 1.6;">
      <p style="margin: 0 0 6px 0;">Este correo fue enviado a <strong style="color: #33475b;">${email}</strong>.</p>
      <p style="margin: 0;">
        Si ya no deseas recibir nuestros correos comerciales, puedes 
        <a href="${unsubscribeUrl}" style="color: #2bbaef; text-decoration: underline; font-weight: bold;">cancelar tu suscripción aquí</a>.
      </p>
      <p style="margin: 8px 0 0 0; font-size: 10px; color: #a3b8cc;">Alimin Inmobiliaria &copy; ${new Date().getFullYear()}</p>
    </div>
    <!-- END FOOTER UNSUBSCRIBE -->
  `;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${footerHtml}</body>`);
  } else {
    return html + footerHtml;
  }
}


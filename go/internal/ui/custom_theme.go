package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// CustomTheme implementa una versión del tema por defecto con colores de texto personalizados
type CustomTheme struct {
	defaultTheme fyne.Theme
}

// NewCustomTheme crea una nueva instancia del tema personalizado
func NewCustomTheme() fyne.Theme {
	return &CustomTheme{
		defaultTheme: theme.DefaultTheme(),
	}
}

// Color devuelve el color para el nombre dado, usando negro para textos principales
func (t *CustomTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	// Personalizamos colores específicos para mejorar la legibilidad
	switch name {
	case theme.ColorNameForeground:
		// Color principal del texto - negro puro
		return color.NRGBA{R: 0, G: 0, B: 0, A: 255}
	case theme.ColorNameDisabled:
		// Texto desactivado - gris oscuro en lugar de gris claro
		return color.NRGBA{R: 80, G: 80, B: 80, A: 180}
	case theme.ColorNamePlaceHolder:
		// Color del texto de placeholder - gris oscuro para mejor visibilidad
		return color.NRGBA{R: 50, G: 50, B: 50, A: 180}
	}

	// Para otros colores, usar el tema por defecto
	return t.defaultTheme.Color(name, variant)
}

// Font devuelve la fuente para el estilo dado usando el tema por defecto
func (t *CustomTheme) Font(style fyne.TextStyle) fyne.Resource {
	return t.defaultTheme.Font(style)
}

// Icon devuelve el icono para el nombre dado usando el tema por defecto
func (t *CustomTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return t.defaultTheme.Icon(name)
}

// Size devuelve el tamaño para el nombre dado usando el tema por defecto
func (t *CustomTheme) Size(name fyne.ThemeSizeName) float32 {
	return t.defaultTheme.Size(name)
}

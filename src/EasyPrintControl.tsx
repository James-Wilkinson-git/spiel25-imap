/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface EasyPrintControlProps {
  position?: string;
  title?: string;
  exportOnly?: boolean;
  hallId?: string;
  customZoom?: number;
}

const EasyPrintControl = ({
  position = "topleft",
  title = "Print Map",
  exportOnly = false,
  hallId,
  customZoom,
}: EasyPrintControlProps) => {
  const map = useMap();

  useEffect(() => {
    let printControl: L.Control | null = null;
    let originalZoom: number | undefined;
    let originalCenter: L.LatLng | undefined;
    let isMounted = true;

    // Hall-specific zoom levels for optimal printing
    const hallZoomLevels: Record<string, number> = {
      "1": -1.65, // Hall 1: 3425x2412 (landscape, ratio 1.42)
      "2": -1.65, // Hall 2: 3346x1829 (wide landscape, ratio 1.83)
      "3": -2.75, // Hall 3: 3100x7225 (extremely tall, ratio 0.43)
      "4": -2, // Hall 4: 2956x4462 (tall, ratio 0.66)
      "5": -2.25, // Hall 5: 3422x3472 (nearly square, ratio 0.99)
      "6": -1.75, // Hall 6: 2479x3508 (portrait, ratio 0.71)
      "7": -2, // Hall 7: 2963x4763 (very tall, ratio 0.62)
      GA: -2.75, // Galeria: 6356x1769 (extremely wide, ratio 3.59)
      FG1: -1.75,
      FG2: -2,
      FG3: -1,
    };

    // Get the appropriate zoom level
    const printZoom =
      customZoom !== undefined
        ? customZoom
        : (hallId ? hallZoomLevels[hallId] : -2) || -2;

    // Before print starts, zoom out to fit on page
    const handleBeforePrint = () => {
      console.log(
        "Before print - current zoom:",
        map.getZoom(),
        "target zoom:",
        printZoom
      );
      originalZoom = map.getZoom();
      originalCenter = map.getCenter();

      // Get the map's image overlay bounds to calculate the center
      let imageOverlay: any = undefined;
      map.eachLayer((layer) => {
        if (layer instanceof L.ImageOverlay) {
          imageOverlay = layer;
        }
      });

      // Always center on the full map bounds for printing, not user's current view
      if (imageOverlay) {
        const bounds = imageOverlay.getBounds();
        const center = bounds.getCenter();
        console.log(
          "Setting view to bounds center:",
          center,
          "zoom:",
          printZoom
        );
        // Use setView with the bounds center to ensure consistent printing
        map.setView(center, printZoom, { animate: false });
        // Give it a moment to apply
        setTimeout(() => {
          map.invalidateSize();
        }, 100);
      } else {
        console.log("No image overlay found, just setting zoom:", printZoom);
        map.setZoom(printZoom, { animate: false });
      }
    };

    // After print, restore original view
    const handleAfterPrint = () => {
      if (originalZoom !== undefined && originalCenter) {
        map.setView(originalCenter, originalZoom);
      }
    };

    const loadAndAttachControl = async () => {
      if (typeof window === "undefined") {
        return;
      }

      // Ensure Leaflet is available on the window for the plugin side effects
      if (!(window as any).L) {
        (window as any).L = L;
      }

      // Dynamically import the plugin so it runs after L is set on window
      if (!(L.Control as any).easyPrint) {
        try {
          await import("leaflet-easyprint");
        } catch (error) {
          console.error("Failed to load leaflet-easyprint plugin:", error);
          return;
        }
      }

      const easyPrintFactory = (L as any).easyPrint
        ? (L as any).easyPrint
        : (L.Control as any).EasyPrint
        ? (options: unknown) => new (L.Control as any).EasyPrint(options)
        : null;

      if (!isMounted || !easyPrintFactory) {
        console.error("leaflet-easyprint plugin not loaded");
        return;
      }

      // Create the EasyPrint control after the plugin is ready
      const control = easyPrintFactory({
        title: title,
        position: position,
        exportOnly: exportOnly,
        hideControlContainer: false,
        hideClasses: ["controls"],
        sizeModes: ["A4Portrait", "A4Landscape"],
        filename: `spiel-hall-${hallId || "map"}-${Date.now()}`,
        tileWait: 1500,
        spinnerBgColor: "#0DC5C1",
      }) as L.Control;

      printControl = control;

      try {
        map.addControl(control);
        map.on("easyPrint-start", handleBeforePrint);
        map.on("easyPrint-finished", handleAfterPrint);
      } catch (error) {
        console.error("Failed to add print control:", error);
      }
    };

    loadAndAttachControl();

    // Cleanup function
    return () => {
      isMounted = false;
      try {
        map.off("easyPrint-start", handleBeforePrint);
        map.off("easyPrint-finished", handleAfterPrint);
        if (printControl) {
          map.removeControl(printControl);
        }
      } catch (e) {
        console.warn("Print control cleanup warning:", e);
      }
    };
  }, [map, position, title, exportOnly, hallId, customZoom]);

  return null;
};

export default EasyPrintControl;

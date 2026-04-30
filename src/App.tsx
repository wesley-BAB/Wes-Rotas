import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Navigation, 
  Fuel, 
  Calculator, 
  Coins, 
  Plus, 
  Trash2, 
  ChevronRight,
  Route as RouteIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  Download
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { LocationInput } from './components/LocationInput';
import * as htmlToImage from 'html-to-image';

// For fix Leaflet marker icons
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Location {
  address: string;
  lat: number | null;
  lon: number | null;
}

interface RouteStats {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: any;
}

// Center map view when route changes
function MapController({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
}

export default function App() {
  const [origin, setOrigin] = useState<Location>({ address: '', lat: null, lon: null });
  const [destination, setDestination] = useState<Location>({ address: '', lat: null, lon: null });
  const [stops, setStops] = useState<Location[]>([]);
  const [fuelPrice, setFuelPrice] = useState<string>('5.50');
  const [autonomy, setAutonomy] = useState<string>('10');
  const [tollsInput, setTollsInput] = useState<string>('0');
  
  const [loading, setLoading] = useState(false);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const dashboardRef = React.useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!dashboardRef.current) return;
    
    setExporting(true);
    try {
      // Small delay to ensure everything is rendered
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const dataUrl = await htmlToImage.toPng(dashboardRef.current, {
        cacheBust: true,
        backgroundColor: '#f8fafc',
      });
      
      const link = document.createElement('a');
      link.download = `wes-rotas-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export error:', err);
      setError("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  const geocode = async (address: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
      return null;
    } catch (e) {
      console.error('Geocoding error:', e);
      return null;
    }
  };

  const handleCalculate = async () => {
    if (!origin.address || !destination.address) {
      setError("Por favor, informe a origem e o destino.");
      return;
    }

    setLoading(true);
    setError(null);
    setRouteStats(null);

    try {
      // 1. Geocode only if lat/lon are missing
      let originPos = { lat: origin.lat, lon: origin.lon };
      if (originPos.lat === null || originPos.lon === null) {
        const result = await geocode(origin.address);
        if (result) originPos = result;
      }

      let destPos = { lat: destination.lat, lon: destination.lon };
      if (destPos.lat === null || destPos.lon === null) {
        const result = await geocode(destination.address);
        if (result) destPos = result;
      }
      
      if (!originPos.lat || !destPos.lat) {
        setError("Não foi possível localizar os endereços. Tente ser mais específico.");
        setLoading(false);
        return;
      }

      setOrigin(prev => ({ ...prev, ...originPos }));
      setDestination(prev => ({ ...prev, ...destPos }));

      const stopPositions: Location[] = [];
      for (const stop of stops) {
        if (stop.address) {
          let pos = { lat: stop.lat, lon: stop.lon };
          if (pos.lat === null || pos.lon === null) {
            const result = await geocode(stop.address);
            if (result) pos = result;
          }

          if (pos.lat && pos.lon) {
            stopPositions.push({ ...stop, ...pos });
          }
        }
      }
      setStops(stopPositions);

      // 2. Build coordinates for routing
      const allCoords = [
        [originPos.lon, originPos.lat],
        ...stopPositions.map(s => [s.lon as number, s.lat as number]),
        [destPos.lon, destPos.lat]
      ].map(c => c.join(',')).join(';');

      // 3. Fetch Route from OSRM
      const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${allCoords}?overview=full&geometries=geojson`);
      const routeData = await routeRes.json();

      if (routeData.code === 'Ok') {
        const route = routeData.routes[0];
        setRouteStats({
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry
        });
      } else {
        setError("Não foi possível calcular a rota entre os pontos informados.");
      }
    } catch (e) {
      setError("Ocorreu um erro ao processar a rota. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const addStop = () => {
    setStops([...stops, { address: '', lat: null, lon: null }]);
  };

  const updateStop = (index: number, address: string) => {
    const newStops = [...stops];
    newStops[index].address = address;
    setStops(newStops);
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const distanceKm = routeStats ? routeStats.distance / 1000 : 0;
  const fuelCost = (distanceKm / parseFloat(autonomy || '1')) * parseFloat(fuelPrice || '0');
  const totalCost = fuelCost + parseFloat(tollsInput || '0');

  const bounds = routeStats ? L.geoJSON(routeStats.geometry).getBounds() : null;

  return (
    <div ref={dashboardRef} className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-96 xl:w-[450px] bg-white shadow-xl flex flex-col z-20 h-full overflow-hidden">
        <header className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">Wes Rotas</h1>
          </div>
          <p className="text-sm text-slate-500">Planeje sua viagem e controle os custos.</p>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Section: Inputs de Rota */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <RouteIcon className="w-4 h-4" /> Itinerário
            </h2>
            
            <div className="space-y-3 relative">
              {/* Decoration Line */}
              <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-100 z-0" />
              
              <div className="space-y-1 relative z-10">
                <label className="text-xs font-semibold text-slate-500 ml-10">Origem</label>
                <LocationInput
                  value={origin.address}
                  onChange={(address, lat, lon) => setOrigin({ address, lat: lat ?? null, lon: lon ?? null })}
                  placeholder="Cidade ou endereço de partida"
                  icon={
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 shrink-0 border-2 border-white shadow-sm">
                      <MapPin className="w-5 h-5" />
                    </div>
                  }
                />
              </div>

              <AnimatePresence>
                {stops.map((stop, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={idx} 
                    className="space-y-1 relative z-10"
                  >
                    <label className="text-xs font-semibold text-slate-500 ml-10 flex justify-between items-center pr-2">
                      Parada {idx + 1}
                      <button onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </label>
                    <LocationInput
                      value={stop.address}
                      onChange={(address, lat, lon) => {
                        const newStops = [...stops];
                        newStops[idx] = { address, lat: lat ?? null, lon: lon ?? null };
                        setStops(newStops);
                      }}
                      placeholder="Endereço da parada"
                      icon={
                        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-50 text-amber-600 shrink-0 border-2 border-white shadow-sm">
                          <MapPin className="w-5 h-5" />
                        </div>
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              <button 
                onClick={addStop}
                className="ml-13 flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors py-2"
              >
                <Plus className="w-4 h-4" /> Adicionar Parada
              </button>

              <div className="space-y-1 relative z-10">
                <label className="text-xs font-semibold text-slate-500 ml-10">Destino</label>
                <LocationInput
                  value={destination.address}
                  onChange={(address, lat, lon) => setDestination({ address, lat: lat ?? null, lon: lon ?? null })}
                  placeholder="Cidade ou endereço de destino"
                  icon={
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shrink-0 border-2 border-white shadow-sm">
                      <MapPin className="w-5 h-5" />
                    </div>
                  }
                />
              </div>
            </div>
          </section>

          {/* Section: Configurações de Veículo */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Fuel className="w-4 h-4" /> Consumo & Custos
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Preço Combustível (R$/L)</label>
                <div className="relative">
                  <Coins className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Consumo (km/L)</label>
                <div className="relative">
                  <Fuel className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input 
                    type="number" 
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={autonomy}
                    onChange={(e) => setAutonomy(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 block">Pedágios Estimados (R$)</label>
              <div className="relative">
                <Coins className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="Se houver pedágio, inclua o valor total"
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={tollsInput}
                  onChange={(e) => setTollsInput(e.target.value)}
                />
              </div>
            </div>
          </section>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </motion.div>
          )}

          <button 
            onClick={handleCalculate}
            disabled={loading}
            className={cn(
              "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-white shadow-lg shadow-indigo-200",
              loading ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
            )}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Calculator className="w-5 h-5" />
                Calcular Rota e Custos
              </>
            )}
          </button>
        </div>

        {/* Footer Stats Summary */}
        <AnimatePresence>
          {routeStats && (
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-indigo-600 p-6 text-white"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Distância Total</p>
                    <p className="text-3xl font-display font-bold">{(routeStats.distance / 1000).toFixed(1)} <span className="text-xl">km</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Tempo Estimado</p>
                    <p className="text-xl font-semibold">{(routeStats.duration / 3600).toFixed(1)}h</p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-xl font-display">
                  <div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Custo Aproximado</p>
                    <p className="font-bold text-3xl">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport();
                    }}
                    disabled={exporting}
                    className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors disabled:opacity-50"
                    title="Exportar Resultado como PNG"
                  >
                    {exporting ? (
                      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-8 h-8 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <MapContainer 
          center={[-15.7801, -47.9292]} // Brasilia default
          zoom={4} 
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            crossOrigin={true}
          />
          
          {origin.lat && origin.lon && (
            <Marker position={[origin.lat, origin.lon]}>
              <Popup>Origem: {origin.address}</Popup>
            </Marker>
          )}

          {stops.map((stop, i) => (
            stop.lat && stop.lon && (
              <Marker key={i} position={[stop.lat, stop.lon]}>
                <Popup>Parada {i + 1}: {stop.address}</Popup>
              </Marker>
            )
          ))}

          {destination.lat && destination.lon && (
            <Marker position={[destination.lat, destination.lon]}>
              <Popup>Destino: {destination.address}</Popup>
            </Marker>
          )}

          {routeStats && (
            <Polyline 
              positions={routeStats.geometry.coordinates.map((c: any) => [c[1], c[0]])}
              pathOptions={{ color: '#4f46e5', weight: 6, opacity: 0.7, lineJoin: 'round' }}
            />
          )}

          <MapController bounds={bounds} />
        </MapContainer>

        {/* Float Overlays */}
        {!routeStats && (
          <div className="absolute top-10 left-10 right-10 z-10 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl w-fit mx-auto border border-white flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-full">
                <Search className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-slate-700 font-medium pr-4">Digite os endereços para começar o planejamento.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

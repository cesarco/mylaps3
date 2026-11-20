#!/usr/bin/env python3
"""
Script para verificar la consistencia de los datos de timing
"""

def time_to_ms(time_str):
    """Convertir formato MM:SS.mmm a milisegundos"""
    try:
        if ':' not in time_str:
            return 0
        parts = time_str.split(':')
        if len(parts) != 2:
            return 0
        
        minutes = int(parts[0])
        if '.' not in parts[1]:
            return 0
            
        sec_parts = parts[1].split('.')
        if len(sec_parts) != 2:
            return 0
            
        seconds = int(sec_parts[0])
        milliseconds = int(sec_parts[1])
        
        return (minutes * 60 + seconds) * 1000 + milliseconds
    except (ValueError, IndexError):
        print(f"Error parsing time: {time_str}")
        return 0

def ms_to_time(ms):
    """Convertir milisegundos a formato MM:SS.mmm"""
    minutes = ms // 60000
    remaining_ms = ms % 60000
    seconds = remaining_ms // 1000
    ms_part = remaining_ms % 1000
    return f'{minutes:02d}:{seconds:02d}.{ms_part:03d}'

def main():
    drivers = {}
    problems = []
    
    with open('data.txt', 'r') as f:
        lines = f.readlines()
    
    # Parsear datos
    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if line.startswith('$J'):
            parts = line.split(',')
            if len(parts) >= 4:
                driver = parts[1].strip('"')
                lap_time = parts[2].strip('"')
                total_time = parts[3].strip('"')
                
                lap_ms = time_to_ms(lap_time)
                total_ms = time_to_ms(total_time)
                
                if driver not in drivers:
                    drivers[driver] = []
                
                drivers[driver].append({
                    'line': line_num,
                    'lap_ms': lap_ms,
                    'total_ms': total_ms,
                    'lap_time': lap_time,
                    'total_time': total_time
                })
    
    # Verificar consistencia
    problem_count = 0
    
    for driver, laps in sorted(drivers.items()):
        print(f'\n=== PILOTO {driver} ({len(laps)} vueltas) ===')
        expected_total = 0
        driver_problems = 0
        
        for i, lap in enumerate(laps):
            expected_total += lap['lap_ms']
            
            # Verificar suma acumulativa
            if abs(lap['total_ms'] - expected_total) > 1:  # Tolerancia de 1ms
                driver_problems += 1
                problem_count += 1
                print(f'❌ Vuelta {i+1}: ERROR en suma acumulativa')
                print(f'   Línea {lap["line"]}: Esperado {ms_to_time(expected_total)}, Actual {lap["total_time"]}')
                print(f'   Diferencia: {lap["total_ms"] - expected_total}ms')
                problems.append(f'Línea {lap["line"]}: Piloto {driver}, vuelta {i+1}')
            elif i < 3:  # Solo mostrar las primeras 3 vueltas OK
                print(f'✅ Vuelta {i+1}: OK - Lap {lap["lap_time"]} → Total {lap["total_time"]}')
            
            # Verificar progresión temporal (comparar con la vuelta anterior del MISMO piloto)
            if i > 0 and lap['total_ms'] <= laps[i-1]['total_ms']:
                driver_problems += 1
                problem_count += 1
                print(f'❌ Vuelta {i+1}: TIEMPO NO PROGRESIVO')
                print(f'   Línea {lap["line"]}: {lap["total_time"]} <= {laps[i-1]["total_time"]}')
                problems.append(f'Línea {lap["line"]}: Piloto {driver}, tiempo no progresivo')
        
        if len(laps) > 3 and driver_problems == 0:
            print(f'   ✅ ... y {len(laps) - 3} vueltas más - todas OK')
        elif driver_problems > 0:
            print(f'   🚨 {driver_problems} problemas en total para este piloto')
    
    # Resumen final
    print(f'\n=== RESUMEN FINAL ===')
    if problem_count > 0:
        print(f'❌ {problem_count} PROBLEMAS ENCONTRADOS')
        print('\nPrimeros problemas:')
        for problem in problems[:10]:
            print(f'  - {problem}')
        if len(problems) > 10:
            print(f'  ... y {len(problems) - 10} problemas más')
        return False
    else:
        print(f'✅ TODOS LOS TIEMPOS SON CONSISTENTES')
        print(f'   - {len(drivers)} pilotos verificados')
        print(f'   - {sum(len(laps) for laps in drivers.values())} vueltas totales')
        return True

if __name__ == '__main__':
    main()

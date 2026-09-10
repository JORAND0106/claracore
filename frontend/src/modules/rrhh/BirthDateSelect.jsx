import RrhhDateSelect from './RrhhDateSelect'

/** Alias del selector estándar Año/Mes/Día para fecha de nacimiento. */
export default function BirthDateSelect(props) {
  return (
    <RrhhDateSelect
      {...props}
      ariaPrefix={props.ariaPrefix || 'Fecha de nacimiento'}
      minYear={props.minYear ?? 1920}
    />
  )
}

import config from '../config'
import DatabaseModel from './DatabaseModel'

export default function Fonts(postgres) {
  const factoryToExtend = DatabaseModel(postgres, 'fonts')

  return Object.assign(
    factoryToExtend,
    {
      accessibleColumns: [ 'col1' ]
    }
  )
}
